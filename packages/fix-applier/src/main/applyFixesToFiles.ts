/**
 * The EFFECTFUL `--fix` file shell — `applyFixesToFiles` (RULE-005's IO edge).
 * Source of truth (READ-ONLY):
 * `legacy/ts-doctor/packages/ts-doctor/src/fix-applier.ts:223-244`
 * (`applyFixesToFiles` over the injected synchronous `FileIo` seam).
 *
 * Where the pure splicer (`./applyFixes.ts`) is plain string math, THIS is the
 * genuinely-effectful slice: it reads each file, runs the pure `applyFixes`, and —
 * WHEN the output differs — writes it back. It is modeled as an `Effect<...>` over the
 * `@effect/platform` `FileSystem` + `Path` services (NOT `node:fs`/`node:path`),
 * exactly mirroring the config loader's Effect-over-FileSystem shape
 * (`modernized/config/effect/src/main/loadConfig.ts`). Dependencies live in the
 * REQUIREMENTS channel and are satisfied by a Layer at the edge: `NodeContext`
 * (production, {@link applyFixesToFilesNode}) or an in-memory stub Layer in tests.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * DELIBERATE SECURITY IMPROVEMENT over legacy's direct `io.write` (CWE-59 cure).
 * ──────────────────────────────────────────────────────────────────────────────
 * Legacy `applyFixesToFiles` called `io.write(path, output)` directly — an in-place
 * write that (a) FOLLOWS symlinks (CWE-59: a symlink in the project tree pointing at
 * an out-of-repo file would be clobbered) and (b) is NON-ATOMIC (a crash mid-write
 * leaves a truncated/partial source file — and `--fix` mutates USER source). The
 * Modernization Brief names this the top security finding (lines 18/72/82). This
 * slice cures them together, BEFORE every write:
 *   1. CANONICAL CONTAINMENT: resolve the target's parent dir with `realPath` (following
 *      any symlinked PREFIX to its real location), then `isInsideRoot(realRoot, target)`.
 *      A pure string check is bypassable by a directory symlink INSIDE the root that
 *      redirects the write outside it (SEC-001/CWE-59); resolving the prefix closes that.
 *      On a real FS `realPath` resolves; the in-memory stub (no symlinks) falls back to
 *      the string path. The attack needs an EXISTING symlink, which `realPath` always
 *      resolves — so the fallback never reopens the hole.
 *   2. SYMLINK REJECT (no-follow): probe the target with `readLink` — which operates on
 *      the link itself and does NOT follow it; success ⇒ symlink ⇒ skip (never
 *      written/clobbered). (This `@effect/platform` has no `lstat`; `readLink`-succeeds is
 *      the no-follow test — see TRANSFORMATION_NOTES.md. The Brief's `lstat` is the same intent.)
 *   3. ATOMIC WRITE: write to an UNPREDICTABLE same-dir temp opened O_EXCL (`flag: "wx"`,
 *      which refuses to FOLLOW or overwrite a pre-planted symlink at the temp path —
 *      SEC-002), then `rename` it over the target — an atomic same-FS replace, never an
 *      in-place truncate.
 * Read failures and write failures SKIP that file (counted, never thrown out) so the
 * aggregate `ApplyFilesResult` is always returned — matching legacy's all-or-each
 * loop semantics while never corrupting a file on a partial failure.
 */

import { FileSystem, Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { applyFixes, groupFixesByFile } from "./applyFixes.js";
import { isInsideRoot } from "./pathContainment.js";
import type { Diagnostic } from "@ts-doctor/contracts-effect";

/** Aggregate outcome of applying fixes across many files. */
export interface ApplyFilesResult {
  filesChanged: number;
  appliedCount: number;
  skippedCount: number;
}

/**
 * Why a file's write was rejected by the security gate (for tests/diagnostics). Not
 * part of the legacy aggregate shape — surfaced via {@link applyFixesToFilesDetailed}.
 */
export type WriteRejection = "symlink" | "out-of-root" | "read-error" | "write-error";

/** Detailed outcome: the legacy aggregate plus the per-file security rejections. */
export interface ApplyFilesDetailedResult extends ApplyFilesResult {
  /** Files whose write was refused by the CWE-59 gate or an IO failure, with why. */
  rejected: ReadonlyArray<{ filePath: string; reason: WriteRejection }>;
}

/**
 * Is `path` a symbolic link? Uses `readLink`, which reads the link's OWN target
 * (no-follow) and FAILS on a regular file. Success ⇒ symlink ⇒ reject (CWE-59).
 * A `readLink` PlatformError (the common "not a symlink" / EINVAL case, or the file
 * vanished) is mapped to `false` so the gate degrades to "treat as non-symlink" and
 * the subsequent atomic write still runs (the write itself fails safely if the file
 * is unwritable). Error channel `never`.
 */
const isSymlink = (
  fs: FileSystem.FileSystem,
  path: string,
): Effect.Effect<boolean> =>
  fs.readLink(path).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );

/**
 * Apply all fixes for a diagnostic set, grouped per file, over the `@effect/platform`
 * `FileSystem` + `Path` services — the CWE-59/atomic cure (see module header). Returns
 * the DETAILED result (aggregate + per-file rejections). Error channel `never`: a read
 * or write `PlatformError`, a symlink, or an out-of-root path SKIPS that file and is
 * counted, so the aggregate is always produced (no throw escapes).
 *
 * `rootDir` is the project root the writes must stay inside; it is resolved with the
 * platform `Path` service so the containment check matches the host's semantics.
 */
export const applyFixesToFilesDetailed = Effect.fn("FixApplier.applyToFilesDetailed")(
  function* (diagnostics: readonly Diagnostic[], rootDir: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const groups = groupFixesByFile(diagnostics);
    let filesChanged = 0;
    let appliedCount = 0;
    let skippedCount = 0;
    const rejected: Array<{ filePath: string; reason: WriteRejection }> = [];

    // Canonical project root (resolve any symlinks in the root path itself), computed
    // ONCE. Each write's REAL (symlink-resolved) location is containment-checked against
    // this — closing the directory-symlink-prefix escape (SEC-001/CWE-59). A real FS
    // resolves it; the in-memory stub (no symlinks) errors → falls back to the string
    // root, preserving the prior behavior for tests.
    const realRoot = yield* fs
      .realPath(rootDir)
      .pipe(Effect.orElseSucceed(() => path.resolve(rootDir)));
    // Per-run temp-name sequence so the atomic-write temp is not a fixed, predictable
    // path (SEC-002, alongside the O_EXCL `wx` flag below).
    let tmpSeq = 0;

    for (const group of groups) {
      // READ — a PlatformError (missing/unreadable) skips this file entirely. Unlike
      // legacy (whose `io.read` could throw out of the whole run), we never throw: a
      // failed read contributes nothing and the loop continues (aggregate preserved).
      const readResult = yield* fs
        .readFileString(group.filePath, "utf8")
        .pipe(Effect.either);

      if (readResult._tag === "Left") {
        rejected.push({ filePath: group.filePath, reason: "read-error" });
        continue;
      }
      const source = readResult.right;

      // PURE splice (RULE-005) — its appliedCount/skippedCount are tallied even when
      // the security gate later refuses the write, so the counts reflect what the
      // algorithm decided (matching legacy, where the counts are pre-write).
      const result = applyFixes(source, group.fixes);
      appliedCount += result.appliedCount;
      skippedCount += result.skippedCount;

      // No change ⇒ never write (legacy `output !== source` guard; also avoids a
      // pointless symlink/atomic dance on a no-op).
      if (result.output === source) continue;

      // ── CWE-59 GATE (before any write) ──
      // 1. Resolve the target's PARENT dir to its REAL path — canonicalizing any
      //    symlinked prefix — then containment-check the CANONICAL target. A pure string
      //    check (the old behavior) is bypassable by a directory symlink INSIDE the root
      //    that redirects the write outside it (SEC-001/CWE-59); resolving the prefix
      //    closes that. On a real FS `realPath` resolves the symlink; the in-memory stub
      //    (no symlinks) errors → falls back to the un-resolved dirname, i.e. the prior
      //    string behavior. (The attack requires an EXISTING symlink, which `realPath`
      //    always resolves — so the fallback never reopens the hole.)
      const realDir = yield* fs
        .realPath(path.dirname(group.filePath))
        .pipe(Effect.orElseSucceed(() => path.dirname(group.filePath)));
      const canonicalTarget = path.join(realDir, path.basename(group.filePath));
      if (!isInsideRoot(realRoot, canonicalTarget)) {
        rejected.push({ filePath: group.filePath, reason: "out-of-root" });
        continue;
      }
      // 2. Symlink reject (no-follow): the target file itself is NEVER followed/clobbered.
      if (yield* isSymlink(fs, canonicalTarget)) {
        rejected.push({ filePath: group.filePath, reason: "symlink" });
        continue;
      }

      // 3. ATOMIC WRITE — an unpredictable same-dir temp opened O_EXCL (`flag: "wx"`, so
      //    it refuses to FOLLOW or overwrite a pre-planted symlink at the temp path —
      //    SEC-002), then `rename` over the canonical target (same-FS atomic replace, not
      //    an in-place truncate). Any failure skips the file WITHOUT corrupting it (the
      //    original is untouched until the rename lands).
      const tmpPath = path.join(
        realDir,
        `.${path.basename(group.filePath)}.${tmpSeq++}.tsdoctor-fix.tmp`,
      );

      const writeAtomic = Effect.gen(function* () {
        yield* fs.writeFileString(tmpPath, result.output, { flag: "wx" });
        yield* fs.rename(tmpPath, canonicalTarget);
      });

      const wrote = yield* writeAtomic.pipe(
        Effect.as(true),
        Effect.catchAll(() =>
          // Best-effort cleanup of the temp file; ignore its own error. The original
          // target is still intact (rename never ran or failed before replacing it).
          fs
            .remove(tmpPath)
            .pipe(Effect.ignore, Effect.as(false)),
        ),
      );

      if (!wrote) {
        rejected.push({ filePath: group.filePath, reason: "write-error" });
        continue;
      }
      filesChanged++;
    }

    return { filesChanged, appliedCount, skippedCount, rejected };
  },
);

/**
 * Apply all fixes for a diagnostic set (the legacy aggregate shape only). Drops the
 * per-file `rejected` detail. Same requirements / error channel (`never`) as
 * {@link applyFixesToFilesDetailed}. This is the direct analogue of legacy
 * `applyFixesToFiles` — same `{ filesChanged, appliedCount, skippedCount }` contract.
 */
export const applyFixesToFiles = (
  diagnostics: readonly Diagnostic[],
  rootDir: string,
): Effect.Effect<ApplyFilesResult, never, FileSystem.FileSystem | Path.Path> =>
  applyFixesToFilesDetailed(diagnostics, rootDir).pipe(
    Effect.map(({ filesChanged, appliedCount, skippedCount }) => ({
      filesChanged,
      appliedCount,
      skippedCount,
    })),
  );

/**
 * The production Layer: the real Node-backed `FileSystem` + `Path` services. This is
 * the ONLY place `@effect/platform-node` is referenced — the shell itself stays
 * platform-agnostic (it depends on the service interfaces, not Node). Tests provide a
 * different (in-memory) Layer for the same two services. Mirrors the config slice's
 * `NodeContext`.
 */
export const NodeContext: Layer.Layer<FileSystem.FileSystem | Path.Path> =
  Layer.merge(NodeFileSystem.layer, NodePath.layer);

/**
 * Runnable convenience: apply fixes against REAL files on disk, resolving the
 * `FileSystem`/`Path` requirements with {@link NodeContext}. This is what the CLI's
 * `--fix` path calls (follow-up: wire it in the CLI slice). NEVER rejects — the shell
 * is total (every IO/security failure skips+counts), so the returned `Promise` always
 * resolves with an {@link ApplyFilesResult}.
 */
export const applyFixesToFilesNode = (
  diagnostics: readonly Diagnostic[],
  rootDir: string,
): Promise<ApplyFilesResult> =>
  Effect.runPromise(applyFixesToFiles(diagnostics, rootDir).pipe(Effect.provide(NodeContext)));

/** Detailed variant of {@link applyFixesToFilesNode} (keeps the `rejected` list). */
export const applyFixesToFilesDetailedNode = (
  diagnostics: readonly Diagnostic[],
  rootDir: string,
): Promise<ApplyFilesDetailedResult> =>
  Effect.runPromise(
    applyFixesToFilesDetailed(diagnostics, rootDir).pipe(Effect.provide(NodeContext)),
  );

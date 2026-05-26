/**
 * Source-file enumeration over the `@effect/platform` `FileSystem` service
 * (RULE-012: source-file discovery caps). Source of truth (READ-ONLY):
 * `legacy/tsnuke/packages/core/src/discover-ts-project.ts:111-153` (`countSourceFiles`,
 * cap 5000) and `:174-207` (`collectSourceFiles`, cap 10000).
 *
 * Both are an ITERATIVE DFS (an explicit stack — no recursion-depth limit on deep
 * trees) that counts/collects files ending `.ts`/`.tsx` but NOT `.d.ts`, skipping a
 * set of noise directories. They are modeled as `Effect<…, never, FileSystem>` — the
 * I/O (`readDirectory`, `stat`) goes through the `FileSystem` service interface, not
 * `node:fs`, satisfied by a Layer at the edge (Node in prod, in-memory stub in tests).
 *
 * ERROR CHANNEL `never` (RULE-012 edge cases). Legacy wraps `readdirSync`/`statSync` in
 * `try { … } catch { continue }` so an unreadable directory or a failed `stat` is
 * SILENTLY SKIPPED, never aborting the walk. The Effect port reproduces this exactly:
 * a `readDirectory`/`stat` `PlatformError` is discarded with `Effect.orElseSucceed`,
 * yielding the same "skip this entry, keep walking" behavior. Truncation at the cap is
 * also silent (a 5001-file repo reports 5000) — a RULE-012 suspected defect, PRESERVED.
 *
 * SUSPECTED DEFECT preserved (RULE-012): the count and collect scans use TWO
 * slightly-different ignore-dir sets (collect adds `.next` + `storybook-static`, AND
 * skips dot-entries) and TWO different caps (5000 vs 10000). This inconsistency is
 * reproduced verbatim and flagged for reconciliation in TRANSFORMATION_NOTES — not
 * "fixed" here.
 *
 * PATH JOINING: legacy used `node:path` `join`/`resolve`. To keep the requirement
 * channel `FileSystem`-only (per the slice contract — both walkers are pure fs walks),
 * paths are joined with a single `"/"` separator. On the in-memory test FS and on the
 * POSIX prod host this is byte-identical to `node:path.join` for the absolute,
 * already-normalized directory keys these walks produce (no `..`/`.` segments survive,
 * since dot-entries are skipped by collect and noise dirs by both). The `Path` SERVICE
 * is reserved for `discover.ts`, which must resolve user-supplied `dir` + `extends`
 * targets where full `node:path` semantics matter.
 */

import { FileSystem } from "@effect/platform";
import { Effect } from "effect";

/**
 * Directories the COUNT scan never walks (legacy `discover-ts-project.ts:113-121`).
 * NOTE this set is SMALLER than {@link SOURCE_SCAN_IGNORED_DIRS} (the collect set) —
 * a RULE-012 inconsistency preserved verbatim.
 */
const COUNT_IGNORED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".turbo",
]);

/**
 * Directories the COLLECT scan never walks (legacy `discover-ts-project.ts:156-166`).
 * Adds `.next` and `storybook-static` over {@link COUNT_IGNORED_DIRS} — the two-set
 * inconsistency (RULE-012 suspected defect), preserved. Collect ALSO skips any entry
 * starting with `.` (handled at the call site), which count does NOT.
 */
const SOURCE_SCAN_IGNORED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  "out",
  "coverage",
  "storybook-static",
]);

/** Default cap for the count scan (legacy `countSourceFiles(root, cap = 5000)`). */
export const COUNT_CAP = 5000;

/** Default cap for the collect scan (legacy `collectSourceFiles(root, cap = 10000)`). */
export const COLLECT_CAP = 10000;

/** A `.ts`/`.tsx` source file, excluding `.d.ts` declarations (RULE-012). */
const isSourceFile = (entry: string): boolean =>
  (entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.endsWith(".d.ts");

/**
 * Single-separator POSIX-style join, matching `node:path.join` for the absolute,
 * normalized directory keys these walks produce. Avoids a `Path`-service requirement so
 * the walkers stay `FileSystem`-only (slice contract).
 */
const joinPath = (dir: string, entry: string): string =>
  dir.endsWith("/") ? `${dir}${entry}` : `${dir}/${entry}`;

/**
 * Read a directory's entry names; a `PlatformError` (unreadable dir) → `[]` so the
 * caller skips it and keeps walking (legacy `try { readdirSync } catch { continue }`).
 */
const safeReadDirectory = (
  fs: FileSystem.FileSystem,
  dir: string,
): Effect.Effect<ReadonlyArray<string>> =>
  fs.readDirectory(dir).pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));

/**
 * `stat` a path, returning whether it is a directory; a `PlatformError` (failed stat)
 * → `undefined` so the caller skips the entry (legacy `try { statSync } catch
 * { continue }`). `undefined` is the "skip" sentinel, distinct from `false` (a file).
 */
const safeIsDirectory = (
  fs: FileSystem.FileSystem,
  full: string,
): Effect.Effect<boolean | undefined> =>
  fs.stat(full).pipe(
    Effect.map((info) => info.type === "Directory"),
    Effect.orElseSucceed(() => undefined as boolean | undefined),
  );

/**
 * Recursively COUNT `.ts`/`.tsx` files (excluding `.d.ts`) under `root`, skipping noise
 * dirs; capped (RULE-012, default {@link COUNT_CAP} = 5000). Port of legacy
 * `countSourceFiles` (`discover-ts-project.ts:111-153`).
 *
 * Iterative DFS over an explicit `stack`, popping (LIFO) just like legacy `stack.pop()`.
 * The cap is checked BOTH in the `while` guard AND after each increment (`break`), so a
 * tree with more than `cap` sources reports exactly `cap` (silent truncation —
 * preserved). Error channel `never` — unreadable dirs / failed stats are silently
 * skipped.
 */
export const countSourceFiles: (
  root: string,
  cap?: number,
) => Effect.Effect<number, never, FileSystem.FileSystem> = Effect.fn("Discovery.count")(
  function* (root: string, cap: number = COUNT_CAP) {
    const fs = yield* FileSystem.FileSystem;
    let count = 0;
    const stack: string[] = [root];
    while (stack.length > 0 && count < cap) {
      const dir = stack.pop();
      if (dir === undefined) break;
      const entries = yield* safeReadDirectory(fs, dir);
      for (const entry of entries) {
        if (COUNT_IGNORED_DIRS.has(entry)) continue;
        const full = joinPath(dir, entry);
        const isDir = yield* safeIsDirectory(fs, full);
        if (isDir === undefined) continue; // failed stat → skip (legacy catch)
        if (isDir) {
          stack.push(full);
        } else if (isSourceFile(entry)) {
          count++;
          if (count >= cap) break;
        }
      }
    }
    return count;
  },
);

/**
 * COLLECT a project's source files (`.ts`/`.tsx`, excluding `.d.ts`, dot-entries, and
 * the larger noise set) under `root` as ABSOLUTE paths; capped (RULE-012, default
 * {@link COLLECT_CAP} = 10000). Port of legacy `collectSourceFiles`
 * (`discover-ts-project.ts:174-207`).
 *
 * Differences from {@link countSourceFiles} faithfully preserved (RULE-012 suspected
 * defect): a LARGER ignore set ({@link SOURCE_SCAN_IGNORED_DIRS}, adding `.next` +
 * `storybook-static`); ALSO skips any entry starting with `.` (dot-dirs/files); and a
 * HIGHER cap (10000). Legacy seeded the stack with `resolve(root)`; the caller passes
 * an already-resolved absolute `root` (discovery resolves it), so the seed is `root`
 * verbatim — `resolve` of an absolute, normalized path is identity. Iterative DFS,
 * silent truncation, silent skip of unreadable dirs/failed stats — all preserved. Error
 * channel `never`.
 */
export const collectSourceFiles: (
  root: string,
  cap?: number,
) => Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem> = Effect.fn(
  "Discovery.collect",
)(function* (root: string, cap: number = COLLECT_CAP) {
  const fs = yield* FileSystem.FileSystem;
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0 && out.length < cap) {
    const dir = stack.pop();
    if (dir === undefined) break;
    const entries = yield* safeReadDirectory(fs, dir);
    for (const entry of entries) {
      if (entry.startsWith(".") || SOURCE_SCAN_IGNORED_DIRS.has(entry)) continue;
      const full = joinPath(dir, entry);
      const isDir = yield* safeIsDirectory(fs, full);
      if (isDir === undefined) continue; // failed stat → skip (legacy catch)
      if (isDir) {
        stack.push(full);
      } else if (isSourceFile(entry)) {
        out.push(full);
        if (out.length >= cap) break;
      }
    }
  }
  return out;
});

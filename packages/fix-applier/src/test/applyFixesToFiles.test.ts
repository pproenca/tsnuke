/**
 * Characterization tests for the EFFECTFUL `--fix` file shell
 * (`src/main/applyFixesToFiles.ts`, RULE-005's IO edge + the CWE-59/atomic cure).
 *
 * Two layers of test, mirroring the config slice's pattern:
 *   1. STUB-FILESYSTEM tests (no real disk) — an in-memory `FileSystem` Layer backed
 *      by a `Map<path, contents>` plus a `Set<symlinkPath>` so we can assert the cure:
 *        - atomic write happens via temp-file + `rename` (recorded);
 *        - an unchanged file is NOT written;
 *        - a SYMLINK target is REJECTED (never followed/clobbered — CWE-59);
 *        - an out-of-root path is REJECTED;
 *        - a read failure SKIPS that file (aggregate still returned).
 *   2. PRODUCTION-Layer tests (real OS temp dir via `NodeContext`) — write a file,
 *      apply a fix, assert contents; and a real symlink is left untouched.
 */

import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as nodeJoin } from "node:path";
import { FileSystem, Path } from "@effect/platform";
import { SystemError } from "@effect/platform/Error";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  applyFixesToFiles,
  applyFixesToFilesDetailed,
  applyFixesToFilesDetailedNode,
} from "../main/applyFixesToFiles.js";
import type { Diagnostic, Fix, TextEdit } from "@tsnuke/contracts-effect";

const autoFix = (...edits: TextEdit[]): Fix => ({ kind: "auto-fix", edits });
const edit = (start: number, end: number, replacement: string): TextEdit => ({
  start,
  end,
  replacement,
});
const diagWithFix = (filePath: string, fix: Fix): Diagnostic => ({
  filePath,
  plugin: "tsnuke",
  rule: "r",
  severity: "warning",
  message: "m",
  help: "h",
  line: 1,
  column: 1,
  category: "c",
  tier: "SYN",
  fix,
});

// ===========================================================================
// STUB FILESYSTEM LAYER — in-memory Map + symlink Set + write/rename log.
// The shell calls: readFileString, readLink (symlink probe), writeFileString,
// rename, remove. We implement exactly those; everything else is a noop.
// ===========================================================================

interface StubFs {
  files: Map<string, string>;
  /** Paths that are symbolic links (so `readLink` SUCCEEDS, marking them symlinks). */
  symlinks: Set<string>;
  /** Ordered op log so tests can assert atomic temp→rename order. */
  ops: string[];
  /** Paths whose readFileString should fail (simulate unreadable file). */
  unreadable: Set<string>;
}

const makeStub = (init: Partial<StubFs> = {}): StubFs => ({
  files: init.files ?? new Map(),
  symlinks: init.symlinks ?? new Set(),
  ops: init.ops ?? [],
  unreadable: init.unreadable ?? new Set(),
});

const notFound = (method: string, path: string): SystemError =>
  new SystemError({
    reason: "NotFound",
    module: "FileSystem",
    method,
    pathOrDescriptor: path,
  });

const stubFsLayer = (s: StubFs): Layer.Layer<FileSystem.FileSystem> =>
  FileSystem.layerNoop({
    readFileString: (path: string) => {
      if (s.unreadable.has(path)) {
        return Effect.fail(notFound("readFileString", path));
      }
      return s.files.has(path)
        ? Effect.succeed(s.files.get(path)!)
        : Effect.fail(notFound("readFileString", path));
    },
    // readLink SUCCEEDS only for a symlink path (no-follow). For a regular file it
    // fails (mirroring EINVAL "not a symlink"), which the shell maps to "not a symlink".
    readLink: (path: string) =>
      s.symlinks.has(path)
        ? Effect.succeed("/some/other/target")
        : Effect.fail(notFound("readLink", path)),
    writeFileString: (path: string, data: string) =>
      Effect.sync(() => {
        s.ops.push(`write:${path}`);
        s.files.set(path, data);
      }),
    rename: (oldPath: string, newPath: string) =>
      Effect.sync(() => {
        s.ops.push(`rename:${oldPath}->${newPath}`);
        const v = s.files.get(oldPath);
        if (v !== undefined) {
          s.files.set(newPath, v);
          s.files.delete(oldPath);
        }
      }),
    remove: (path: string) =>
      Effect.sync(() => {
        s.ops.push(`remove:${path}`);
        s.files.delete(path);
      }),
  });

const testLayer = (s: StubFs): Layer.Layer<FileSystem.FileSystem | Path.Path> =>
  Layer.merge(stubFsLayer(s), Path.layer);

const ROOT = "/proj";

const runDetailed = (diagnostics: Diagnostic[], s: StubFs, root = ROOT) =>
  Effect.runPromise(
    applyFixesToFilesDetailed(diagnostics, root).pipe(Effect.provide(testLayer(s))),
  );

// ===========================================================================
// 1. atomic write (temp → rename)
// ===========================================================================
describe("applyFixesToFiles — atomic write via temp-file + rename (CWE-59 cure)", () => {
  it("changed file: writes a TEMP sibling then RENAMEs over the target (in that order)", async () => {
    const target = "/proj/a.ts";
    const s = makeStub({ files: new Map([[target, "let x"]]) });
    const result = await runDetailed(
      [diagWithFix(target, autoFix(edit(0, 3, "const")))],
      s,
    );
    expect(result).toEqual({
      filesChanged: 1,
      appliedCount: 1,
      skippedCount: 0,
      rejected: [],
    });
    // The final contents are the fixed source.
    expect(s.files.get(target)).toBe("const x");
    // The op log proves it was a temp write THEN a rename over the target (atomic),
    // not an in-place writeFileString on the target itself.
    const tmp = "/proj/.a.ts.0.tsnuke-fix.tmp"; // unpredictable per-run suffix (SEC-002)
    expect(s.ops).toEqual([`write:${tmp}`, `rename:${tmp}->${target}`]);
    // No leftover temp file.
    expect(s.files.has(tmp)).toBe(false);
  });

  it("the target is NEVER written in place (no direct writeFileString on the target path)", async () => {
    const target = "/proj/a.ts";
    const s = makeStub({ files: new Map([[target, "let x"]]) });
    await runDetailed([diagWithFix(target, autoFix(edit(0, 3, "const")))], s);
    expect(s.ops).not.toContain(`write:${target}`);
  });
});

// ===========================================================================
// 2. unchanged file NOT written
// ===========================================================================
describe("applyFixesToFiles — unchanged file is not written", () => {
  it("a no-op fix (output === source) → no write, no rename, filesChanged 0", async () => {
    const target = "/proj/a.ts";
    const s = makeStub({ files: new Map([[target, "abc"]]) });
    // An all-degenerate fix produces output === source.
    const result = await runDetailed(
      [diagWithFix(target, autoFix(edit(-1, 1, "X")))],
      s,
    );
    expect(result.filesChanged).toBe(0);
    expect(s.ops).toEqual([]);
  });

  it("a fix whose replacement equals the existing text → output === source → no write", async () => {
    const target = "/proj/a.ts";
    const s = makeStub({ files: new Map([[target, "abc"]]) });
    const result = await runDetailed(
      [diagWithFix(target, autoFix(edit(0, 1, "a")))],
      s,
    );
    expect(result.filesChanged).toBe(0);
    expect(s.ops).toEqual([]);
  });
});

// ===========================================================================
// 3. SYMLINK rejected (CWE-59 — not followed, not clobbered)
// ===========================================================================
describe("applyFixesToFiles — SYMLINK target rejected (CWE-59 cure)", () => {
  it("a symlinked path is SKIPPED: never written/renamed, counted as rejected 'symlink'", async () => {
    const target = "/proj/link.ts";
    const s = makeStub({
      files: new Map([[target, "let x"]]),
      symlinks: new Set([target]),
    });
    const result = await runDetailed(
      [diagWithFix(target, autoFix(edit(0, 3, "const")))],
      s,
    );
    expect(result.filesChanged).toBe(0);
    expect(result.appliedCount).toBe(1); // the pure splice still counts
    expect(result.rejected).toEqual([{ filePath: target, reason: "symlink" }]);
    // The cure: NO write and NO rename touched the symlink (or its target).
    expect(s.ops).toEqual([]);
    // The symlink's recorded contents are UNCHANGED (not clobbered).
    expect(s.files.get(target)).toBe("let x");
  });
});

// ===========================================================================
// 4. out-of-root rejected
// ===========================================================================
describe("applyFixesToFiles — out-of-root path rejected", () => {
  it("a path resolving OUTSIDE rootDir is skipped + counted, never written", async () => {
    const target = "/etc/passwd";
    const s = makeStub({ files: new Map([[target, "secret"]]) });
    const result = await runDetailed(
      [diagWithFix(target, autoFix(edit(0, 6, "pwned!")))],
      s,
      "/proj",
    );
    expect(result.filesChanged).toBe(0);
    expect(result.rejected).toEqual([{ filePath: target, reason: "out-of-root" }]);
    expect(s.ops).toEqual([]);
    expect(s.files.get(target)).toBe("secret");
  });

  it("a `..`-escaping path under root is rejected", async () => {
    const target = "/proj/sub/../../outside.ts";
    const s = makeStub({ files: new Map([[target, "x"]]) });
    const result = await runDetailed(
      [diagWithFix(target, autoFix(edit(0, 1, "Y")))],
      s,
      "/proj",
    );
    expect(result.rejected).toEqual([{ filePath: target, reason: "out-of-root" }]);
    expect(result.filesChanged).toBe(0);
  });
});

// ===========================================================================
// 5. read failure skips the file (aggregate still returned, never thrown)
// ===========================================================================
describe("applyFixesToFiles — read failure skips file (never throws out)", () => {
  it("an unreadable file is skipped + counted 'read-error'; other files still processed", async () => {
    const bad = "/proj/bad.ts";
    const good = "/proj/good.ts";
    const s = makeStub({
      files: new Map([[good, "let x"]]),
      unreadable: new Set([bad]),
    });
    const result = await runDetailed(
      [
        diagWithFix(bad, autoFix(edit(0, 1, "Z"))),
        diagWithFix(good, autoFix(edit(0, 3, "const"))),
      ],
      s,
    );
    expect(result.filesChanged).toBe(1);
    expect(result.appliedCount).toBe(1); // only good's edit counted
    expect(result.rejected).toEqual([{ filePath: bad, reason: "read-error" }]);
    expect(s.files.get(good)).toBe("const x");
  });

  it("the public applyFixesToFiles projection drops the `rejected` detail", async () => {
    const target = "/proj/a.ts";
    const s = makeStub({ files: new Map([[target, "let x"]]) });
    const result = await Effect.runPromise(
      applyFixesToFiles([diagWithFix(target, autoFix(edit(0, 3, "const")))], ROOT).pipe(
        Effect.provide(testLayer(s)),
      ),
    );
    expect(result).toEqual({ filesChanged: 1, appliedCount: 1, skippedCount: 0 });
    expect(result).not.toHaveProperty("rejected");
  });
});

// ===========================================================================
// 6. multi-file aggregate
// ===========================================================================
describe("applyFixesToFiles — multi-file aggregate", () => {
  it("aggregates filesChanged/appliedCount/skippedCount across files (grouped by path)", async () => {
    const a = "/proj/a.ts";
    const b = "/proj/b.ts";
    const s = makeStub({
      files: new Map([
        [a, "let x"],
        [b, "abcde"],
      ]),
    });
    const result = await runDetailed(
      [
        diagWithFix(a, autoFix(edit(0, 3, "const"))),
        // b: a 3-overlap cluster → 1 applied, 2 skipped (RULE-005), output changes.
        diagWithFix(b, autoFix(edit(0, 3, "P"), edit(1, 4, "Q"), edit(2, 5, "X"))),
      ],
      s,
    );
    expect(result.filesChanged).toBe(2);
    expect(result.appliedCount).toBe(2); // 1 (a) + 1 (b winner)
    expect(result.skippedCount).toBe(2); // b's two conflicts
    expect(s.files.get(a)).toBe("const x");
    expect(s.files.get(b)).toBe("abX");
  });

  it("empty diagnostics → zero aggregate, no ops", async () => {
    const s = makeStub();
    const result = await runDetailed([], s);
    expect(result).toEqual({
      filesChanged: 0,
      appliedCount: 0,
      skippedCount: 0,
      rejected: [],
    });
    expect(s.ops).toEqual([]);
  });
});

// ===========================================================================
// 7. PRODUCTION Layer — real OS temp dir via NodeContext
// ===========================================================================
describe("PRODUCTION Layer — applyFixesToFilesDetailedNode on a REAL temp dir", () => {
  it("reads a real file, applies a fix, writes it atomically (contents updated)", async () => {
    const dir = mkdtempSync(nodeJoin(tmpdir(), "tsnuke-fix-"));
    try {
      const file = nodeJoin(dir, "a.ts");
      writeFileSync(file, "let x = 1;");
      const result = await applyFixesToFilesDetailedNode(
        [diagWithFix(file, autoFix(edit(0, 3, "const")))],
        dir,
      );
      expect(result.filesChanged).toBe(1);
      expect(result.appliedCount).toBe(1);
      expect(result.rejected).toEqual([]);
      expect(readFileSync(file, "utf8")).toBe("const x = 1;");
      // No leftover temp file.
      const tmp = nodeJoin(dir, ".a.ts.0.tsnuke-fix.tmp");
      expect(() => readFileSync(tmp, "utf8")).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a REAL symlink is rejected and its target file is NOT modified (CWE-59 regression)", async () => {
    const dir = mkdtempSync(nodeJoin(tmpdir(), "tsnuke-fix-"));
    try {
      const realTarget = nodeJoin(dir, "real.ts");
      const link = nodeJoin(dir, "link.ts");
      writeFileSync(realTarget, "let x = 1;");
      symlinkSync(realTarget, link);

      const result = await applyFixesToFilesDetailedNode(
        [diagWithFix(link, autoFix(edit(0, 3, "const")))],
        dir,
      );
      expect(result.filesChanged).toBe(0);
      expect(result.rejected).toEqual([{ filePath: link, reason: "symlink" }]);
      // The cure: the symlink's pointee is UNTOUCHED.
      expect(readFileSync(realTarget, "utf8")).toBe("let x = 1;");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a directory-symlink PREFIX inside root cannot redirect a write outside root (SEC-001/CWE-59)", async () => {
    const root = mkdtempSync(nodeJoin(tmpdir(), "tsnuke-fix-root-"));
    const outside = mkdtempSync(nodeJoin(tmpdir(), "tsnuke-fix-out-"));
    try {
      // A real victim OUTSIDE the root, reachable via a directory symlink INSIDE it.
      writeFileSync(nodeJoin(outside, "victim.ts"), "let x = 1;");
      symlinkSync(outside, nodeJoin(root, "escape")); // root/escape -> outside (dir symlink)
      const viaSymlink = nodeJoin(root, "escape", "victim.ts"); // string-inside, real-OUTSIDE

      const result = await applyFixesToFilesDetailedNode(
        [diagWithFix(viaSymlink, autoFix(edit(0, 3, "const")))],
        root,
      );
      // realPath resolves the prefix → canonical target is outside root → rejected, NOT
      // written. A pure string check (the old behavior) would have passed it through.
      expect(result.filesChanged).toBe(0);
      expect(result.rejected).toEqual([{ filePath: viaSymlink, reason: "out-of-root" }]);
      // The out-of-root victim is UNTOUCHED.
      expect(readFileSync(nodeJoin(outside, "victim.ts"), "utf8")).toBe("let x = 1;");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("a pre-planted symlink at the O_EXCL temp path is NOT followed — file skipped, pointee untouched (SEC-002)", async () => {
    const dir = mkdtempSync(nodeJoin(tmpdir(), "tsnuke-fix-"));
    const outside = mkdtempSync(nodeJoin(tmpdir(), "tsnuke-fix-out-"));
    try {
      const file = nodeJoin(dir, "a.ts");
      writeFileSync(file, "let x = 1;");
      const victim = nodeJoin(outside, "victim.txt");
      writeFileSync(victim, "SECRET");
      // Attacker pre-plants a symlink at the temp path the cure will use (first file → .0.).
      symlinkSync(victim, nodeJoin(dir, ".a.ts.0.tsnuke-fix.tmp"));

      const result = await applyFixesToFilesDetailedNode(
        [diagWithFix(file, autoFix(edit(0, 3, "const")))],
        dir,
      );
      // `flag: "wx"` (O_EXCL) refuses to follow/overwrite the pre-planted symlink → the
      // temp write fails → the file is skipped (write-error), NOT written through the link.
      expect(result.filesChanged).toBe(0);
      expect(result.rejected).toEqual([{ filePath: file, reason: "write-error" }]);
      // The symlink's pointee is UNTOUCHED, and the real source is unchanged (no rename ran).
      expect(readFileSync(victim, "utf8")).toBe("SECRET");
      expect(readFileSync(file, "utf8")).toBe("let x = 1;");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("never rejects/throws for a missing file (read-error skip)", async () => {
    const dir = mkdtempSync(nodeJoin(tmpdir(), "tsnuke-fix-"));
    try {
      const missing = nodeJoin(dir, "ghost.ts");
      const result = await applyFixesToFilesDetailedNode(
        [diagWithFix(missing, autoFix(edit(0, 1, "Z")))],
        dir,
      );
      expect(result.filesChanged).toBe(0);
      expect(result.rejected).toEqual([{ filePath: missing, reason: "read-error" }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

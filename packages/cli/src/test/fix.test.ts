/**
 * `--fix` end-to-end over a REAL temp dir — proves the CLI wires
 * `applyFixesToFilesNode` (fix-applier slice) so a fixable diagnostic mutates the file.
 *
 * The handler delegates fix application to the slice; here we drive the SAME runnable
 * the production seam uses (`applyFixesToFilesNode`) against a real on-disk file and
 * assert the splice landed (atomic temp+rename, CWE-59-safe per the slice).
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyFixesToFilesNode } from "@ts-doctor/fix-applier-effect";
import type { Diagnostic } from "@ts-doctor/contracts-effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tsdoctor-fix-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("--fix wiring against real files (applyFixesToFilesNode)", () => {
  it("applies an auto-fix TextEdit to a file on disk", async () => {
    const file = join(dir, "a.ts");
    const source = "const x: any = 1;\n";
    writeFileSync(file, source, "utf8");

    // Replace the `any` (offsets [9,12)) with `number`.
    const start = source.indexOf("any");
    const fixable: Diagnostic = {
      filePath: file,
      plugin: "ts-doctor",
      rule: "no-any",
      severity: "warning",
      message: "Avoid `any`.",
      help: "Use a precise type.",
      line: 1,
      column: 10,
      category: "type-safety",
      tier: "SYN",
      fix: {
        kind: "auto-fix",
        edits: [{ start, end: start + 3, replacement: "number" }],
      },
    };

    const res = await applyFixesToFilesNode([fixable], dir);
    expect(res.appliedCount).toBe(1);
    expect(res.filesChanged).toBe(1);
    expect(readFileSync(file, "utf8")).toBe("const x: number = 1;\n");
  });

  it("a non-auto-fix (manual) diagnostic mutates nothing", async () => {
    const file = join(dir, "b.ts");
    writeFileSync(file, "const y: any = 2;\n", "utf8");
    const manual: Diagnostic = {
      filePath: file,
      plugin: "ts-doctor",
      rule: "no-any",
      severity: "warning",
      message: "Avoid `any`.",
      help: "Use a precise type.",
      line: 1,
      column: 10,
      category: "type-safety",
      tier: "SYN",
      // manual fix kind ⇒ not mechanically applied (RULE-032)
      fix: { kind: "manual", edits: [{ start: 9, end: 12, replacement: "number" }] },
    };
    const res = await applyFixesToFilesNode([manual], dir);
    expect(res.filesChanged).toBe(0);
    expect(readFileSync(file, "utf8")).toBe("const y: any = 2;\n");
  });
});

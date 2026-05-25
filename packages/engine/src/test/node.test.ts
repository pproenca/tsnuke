/**
 * PROD-LAYER tests — `diagnoseNode` against a REAL temp directory on disk (the only tests
 * that touch the actual `NodeFileSystem`/`NodePath` Layers + `Effect.scoped`). This proves
 * the production NodeContext wiring works end-to-end (the config slice's review lesson: a
 * stub-only suite can miss a prod-Layer mistake). The Program lifetime is bounded by
 * `Effect.scoped` inside `diagnoseNode` (RULE-036).
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diagnoseNode } from "../main/node.js";

const FULLY_STRICT_TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    target: "ESNext",
    module: "ESNext",
  },
});

let cleanDir: string;
let dirtyDir: string;

beforeAll(() => {
  // A CLEAN project: fully-strict tsconfig + a no-violation source → score 100.
  cleanDir = mkdtempSync(join(tmpdir(), "tsd-engine-clean-"));
  writeFileSync(join(cleanDir, "tsconfig.json"), FULLY_STRICT_TSCONFIG);
  mkdirSync(join(cleanDir, "src"));
  writeFileSync(
    join(cleanDir, "src", "index.ts"),
    "export const greet = (name: string): string => `hi ${name}`;\n",
  );

  // A DIRTY project: same tsconfig + a source with a SYN violation (no-explicit-any).
  dirtyDir = mkdtempSync(join(tmpdir(), "tsd-engine-dirty-"));
  writeFileSync(join(dirtyDir, "tsconfig.json"), FULLY_STRICT_TSCONFIG);
  mkdirSync(join(dirtyDir, "src"));
  writeFileSync(
    join(dirtyDir, "src", "bad.ts"),
    "export function f(x: any): number {\n  return Number(x);\n}\n",
  );
});

afterAll(() => {
  rmSync(cleanDir, { recursive: true, force: true });
  rmSync(dirtyDir, { recursive: true, force: true });
});

describe("diagnoseNode — production NodeContext wiring (real disk)", () => {
  it("a clean real project → score 100, Great, no diagnostics, not partial", async () => {
    const result = await diagnoseNode(cleanDir);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.score?.score).toBe(100);
    expect(result.score?.label).toBe("Great");
    expect(result.score?.partial).toBe(false);
    // `elapsedMilliseconds` is the one non-deterministic field — present + non-negative.
    expect(result.elapsedMilliseconds).toBeGreaterThanOrEqual(0);
    expect(result.project.rootDirectory).toBe(cleanDir);
  });

  it("a real project with a SYN violation → no-explicit-any fires + score drops", async () => {
    const result = await diagnoseNode(dirtyDir);
    const ids = new Set(result.diagnostics.map((d) => d.rule));
    expect(ids.has("no-explicit-any")).toBe(true);
    expect(result.score?.score).toBeLessThan(100);
  });

  it("a directory with no tsconfig.json → rejects with TsconfigNotFoundError", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "tsd-engine-empty-"));
    writeFileSync(join(emptyDir, "x.ts"), "export const x = 1;\n");
    try {
      await expect(diagnoseNode(emptyDir)).rejects.toThrow(/tsconfig\.json/);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

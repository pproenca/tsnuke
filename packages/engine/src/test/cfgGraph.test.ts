/**
 * End-to-end CFG + GRAPH tier tests through `diagnose` (in-memory FileSystem).
 *
 *   CFG (BC-09): a tsconfig WITHOUT `strict` → `enable-strict` fires as exactly ONE
 *     project-level diagnostic at the tsconfig, line 1; WITH `strict` (+ the other strict
 *     flags) → it does NOT fire.
 *   GRAPH (RULE-015): two files importing each other → `no-import-cycles` fires (once per
 *     closing node, at line 1).
 */

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";
import { diagnose } from "../main/diagnose.js";
import { makeTree, testLayer, type Tree } from "./stubFs.js";

const FULLY_STRICT_TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    target: "ESNext",
    module: "ESNext",
  },
});

const LOOSE_TSCONFIG = JSON.stringify({
  compilerOptions: { target: "ESNext", module: "ESNext" },
});

const run = (tree: Tree, dir: string, options = {}) =>
  diagnose(dir, options).pipe(Effect.scoped, Effect.provide(testLayer(tree)));

describe("diagnose — CFG tier (BC-09)", () => {
  it.effect(
    "tsconfig WITHOUT strict → enable-strict fires ONCE at the tsconfig (line 1, CFG)",
    () =>
      Effect.gen(function* () {
        const tree = makeTree({
          "/proj/tsconfig.json": LOOSE_TSCONFIG,
          "/proj/src/x.ts": "export const x = 1;\n",
        });
        const result = yield* run(tree, "/proj");

        const cfg = result.diagnostics.filter((d) => d.rule === "enable-strict");
        expect(cfg).toHaveLength(1);
        expect(cfg[0]!.tier).toBe("CFG");
        // Pinned to the project's tsconfig.json, line 1 (resolved against root).
        expect(cfg[0]!.filePath).toBe("/proj/tsconfig.json");
        expect(cfg[0]!.line).toBe(1);
        expect(cfg[0]!.column).toBe(1);
      }),
  );

  it.effect("tsconfig WITH the full strict family → enable-strict does NOT fire", () =>
    Effect.gen(function* () {
      const tree = makeTree({
        "/proj/tsconfig.json": FULLY_STRICT_TSCONFIG,
        "/proj/src/x.ts": "export const x = 1;\n",
      });
      const result = yield* run(tree, "/proj");
      expect(result.diagnostics.some((d) => d.rule === "enable-strict")).toBe(false);
    }),
  );
});

describe("diagnose — GRAPH tier (RULE-015)", () => {
  it.effect("two files importing each other → no-import-cycles fires", () =>
    Effect.gen(function* () {
      const tree = makeTree({
        "/proj/tsconfig.json": FULLY_STRICT_TSCONFIG,
        "/proj/src/a.ts": `import "./b.js";\nexport const a = 1;\n`,
        "/proj/src/b.ts": `import "./a.js";\nexport const b = 2;\n`,
      });
      const result = yield* run(tree, "/proj");

      const cycles = result.diagnostics.filter((d) => d.rule === "no-import-cycles");
      expect(cycles.length).toBeGreaterThanOrEqual(1);
      expect(cycles.every((d) => d.tier === "GRAPH" && d.line === 1)).toBe(true);
      expect(cycles.every((d) => d.severity === "error")).toBe(true);
    }),
  );
});

/**
 * End-to-end characterization tests for `diagnoseWorkspace` (the MONOREPO boundary, BC-05)
 * over an IN-MEMORY workspace (stub `FileSystem` Layer, no real disk). Proves the dormant
 * multi-project path is now wired: a workspace ROOT with no root tsconfig discovers + scores
 * each member; a single-project dir behaves like `diagnose`; a non-project dir still fails.
 *
 * `diagnoseWorkspace` discharges each per-project `Scope` internally (RULE-036 / BC-24), so
 * unlike `diagnose` these runs do NOT wrap `Effect.scoped` — only the FileSystem|Path Layer.
 */

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";
import { diagnoseWorkspace } from "../main/diagnoseWorkspace.js";
import { makeTree, testLayer, type Tree } from "./stubFs.js";

const STRICT_TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    target: "ESNext",
    module: "ESNext",
  },
});

/** Run `diagnoseWorkspace` over an in-memory tree (Scope is discharged internally). */
const run = (tree: Tree, dir: string, options = {}) =>
  diagnoseWorkspace(dir, options).pipe(Effect.provide(testLayer(tree)));

describe("diagnoseWorkspace — pnpm workspace root", () => {
  it.effect("discovers + analyzes each member; isWorkspace=true, sorted, per-project scores", () =>
    Effect.gen(function* () {
      const tree = makeTree({
        "/ws/pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
        // a clean member → score 100
        "/ws/packages/clean/tsconfig.json": STRICT_TSCONFIG,
        "/ws/packages/clean/src/ok.ts":
          "export const greet = (n: string): string => `hi ${n}`;\n",
        // a member with a SYN violation (no-explicit-any) → score < 100
        "/ws/packages/messy/tsconfig.json": STRICT_TSCONFIG,
        "/ws/packages/messy/src/bad.ts":
          "export function f(x: any): number {\n  return 1;\n}\n",
      });

      const result = yield* run(tree, "/ws");

      expect(result.isWorkspace).toBe(true);
      expect(result.rootDirectory).toBe("/ws");
      expect(result.projects).toHaveLength(2);
      // Deterministic directory order (sorted): clean before messy.
      expect(result.projects.map((p) => p.project.rootDirectory)).toStrictEqual([
        "/ws/packages/clean",
        "/ws/packages/messy",
      ]);
      expect(result.projects[0]?.score?.score).toBe(100);
      expect(result.projects[1]?.score?.score).toBeLessThan(100);
      const messyIds = new Set(result.projects[1]?.diagnostics.map((d) => d.rule));
      expect(messyIds.has("no-explicit-any")).toBe(true);
    }),
  );

  it.effect("skips workspace members that lack a tsconfig.json", () =>
    Effect.gen(function* () {
      const tree = makeTree({
        "/ws/pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
        "/ws/packages/ts/tsconfig.json": STRICT_TSCONFIG,
        "/ws/packages/ts/src/ok.ts": "export const x = 1;\n",
        "/ws/packages/not-ts/package.json": "{}", // no tsconfig → not a project
      });

      const result = yield* run(tree, "/ws");

      expect(result.isWorkspace).toBe(true);
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0]?.project.rootDirectory).toBe("/ws/packages/ts");
    }),
  );
});

describe("diagnoseWorkspace — single project", () => {
  it.effect("a dir WITH a root tsconfig → isWorkspace=false, one project (like diagnose)", () =>
    Effect.gen(function* () {
      const tree = makeTree({
        "/proj/tsconfig.json": STRICT_TSCONFIG,
        "/proj/src/ok.ts": "export const x = 1;\n",
      });

      const result = yield* run(tree, "/proj");

      expect(result.isWorkspace).toBe(false);
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0]?.project.rootDirectory).toBe("/proj");
      expect(result.projects[0]?.score?.score).toBe(100);
    }),
  );
});

describe("diagnoseWorkspace — neither project nor workspace", () => {
  it.effect("no tsconfig + not a workspace → fails with TsconfigNotFoundError", () =>
    Effect.gen(function* () {
      const tree = makeTree({ "/x/src/a.ts": "export const a = 1;\n" });
      const exit = yield* run(tree, "/x").pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
      expect(JSON.stringify(exit)).toContain("TsconfigNotFoundError");
    }),
  );
});

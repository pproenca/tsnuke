/**
 * End-to-end characterization tests for `diagnose` (the public boundary) over an
 * IN-MEMORY project (stub `FileSystem` Layer, no real disk). Proves the ~12-slice wiring:
 * discover → capabilities → config → engine (Tier-1/Tier-2) → filter → score.
 *
 * RULE-018 (two-tier / partial-honesty) is the spine of this suite: a clean project
 * scores 100 with no diagnostics; SYN violations fire + drop the score; a type-checking
 * project opens Tier-2 (TYP fires, scorePartial=false); a TYPE ERROR closes Tier-2 (TYP
 * skipped, NO_TYPECHECK reasons, scorePartial=true); `--no-deep` closes it too
 * (NO_DEEP). CFG/GRAPH/RULE-036/RULE-013 are pinned in their own files.
 */

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";
import { diagnose } from "../main/diagnose.js";
import { SKIP_REASON_NO_TYPECHECK } from "../main/runEngine.js";
import { makeTree, testLayer, type Tree } from "./stubFs.js";

/**
 * A FULLY-strict tsconfig: `strict` plus the two extra flags the OTHER CFG strictness
 * rules gate on (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). With all
 * three ON, NONE of the 4 `enable-*` CFG rules fire (they self-disable when their flag is
 * present — RULE-020 inverted gating), so a clean project produces ZERO diagnostics.
 * `strict` also covers `useUnknownInCatchVariables` (that rule's `disabledBy` includes
 * `strict`).
 */
const STRICT_TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    target: "ESNext",
    module: "ESNext",
  },
});

/** Run `diagnose` over an in-memory tree, providing FileSystem|Path + bounding Scope. */
const run = (tree: Tree, dir: string, options = {}) =>
  diagnose(dir, options).pipe(Effect.scoped, Effect.provide(testLayer(tree)));

/** Get the set of rule ids in a diagnostics list. */
const ruleIds = (diags: ReadonlyArray<{ rule: string }>): Set<string> =>
  new Set(diags.map((d) => d.rule));

describe("diagnose — clean project (RULE-018 full run)", () => {
  it.effect("a clean file → score 100, band Great, no diagnostics, scorePartial=false", () =>
    Effect.gen(function* () {
      const tree = makeTree({
        "/proj/tsconfig.json": STRICT_TSCONFIG,
        "/proj/src/clean.ts": "export const greet = (name: string): string => `hi ${name}`;\n",
      });
      const result = yield* run(tree, "/proj");

      expect(result.diagnostics).toStrictEqual([]);
      expect(result.score).not.toBeNull();
      expect(result.score?.score).toBe(100);
      expect(result.score?.label).toBe("Great");
      expect(result.score?.partial).toBe(false);
      expect(result.scorePartial).toBe(false);
      expect(result.skippedChecks).toStrictEqual([]);
      expect(result.project.rootDirectory).toBe("/proj");
    }),
  );
});

describe("diagnose — SYN violations (Tier-1 always runs)", () => {
  it.effect("no-explicit-any + triple-equals fire; score drops below 100", () =>
    Effect.gen(function* () {
      const tree = makeTree({
        "/proj/tsconfig.json": STRICT_TSCONFIG,
        // `any` annotation (no-explicit-any) + loose `==` (triple-equals). Note: the file
        // intentionally type-checks (so we isolate SYN behaviour from the Tier-2 gate).
        "/proj/src/bad.ts":
          "export function f(x: any): boolean {\n  return x == 1;\n}\n",
      });
      const result = yield* run(tree, "/proj");

      const ids = ruleIds(result.diagnostics);
      expect(ids.has("no-explicit-any")).toBe(true);
      expect(ids.has("triple-equals")).toBe(true);
      expect(result.score?.score).toBeLessThan(100);
      // Both SYN rules are `warning` severity → distinct-rule penalty applied.
      expect(result.score?.partial).toBe(false);
    }),
  );

  it.effect("a `var` + `==` file → no-var + triple-equals SYN rules fire", () =>
    Effect.gen(function* () {
      const tree = makeTree({
        "/proj/tsconfig.json": STRICT_TSCONFIG,
        "/proj/src/legacy.ts":
          "export function g(): boolean {\n  var n = 1;\n  return n == 1;\n}\n",
      });
      const result = yield* run(tree, "/proj");

      const ids = ruleIds(result.diagnostics);
      expect(ids.has("no-var")).toBe(true);
      expect(ids.has("triple-equals")).toBe(true);
    }),
  );
});

describe("diagnose — RULE-018 two-tier / partial honesty", () => {
  it.effect(
    "a project that type-checks → Tier-2 runs (no-floating-promises fires), scorePartial=false",
    () =>
      Effect.gen(function* () {
        const tree = makeTree({
          "/proj/tsconfig.json": STRICT_TSCONFIG,
          // A floating promise in a type-checking file. `no-floating-promises` is TYP and
          // requires `typecheck:ok` + the checker — it can ONLY fire when Tier-2 is open.
          "/proj/src/async.ts":
            "async function work(): Promise<number> {\n  return 1;\n}\nexport function run(): void {\n  work();\n}\n",
        });
        const result = yield* run(tree, "/proj");

        const ids = ruleIds(result.diagnostics);
        expect(ids.has("no-floating-promises")).toBe(true);
        expect(result.scorePartial).toBe(false);
        expect(result.score?.partial).toBe(false);
        // No TYP rule was skipped — Tier-2 was open.
        expect(result.skippedChecks).not.toContain("no-floating-promises");
      }),
  );

  it.effect(
    "a project with a TYPE ERROR → Tier-2 skipped: TYP in skippedChecks + NO_TYPECHECK reason + scorePartial=true",
    () =>
      Effect.gen(function* () {
        const tree = makeTree({
          "/proj/tsconfig.json": STRICT_TSCONFIG,
          // A type error: assigning a string to a number. The SAME file ALSO has a
          // floating promise — but Tier-2 is closed, so no-floating-promises must NOT fire
          // and must instead be RECORDED as skipped (the partial-honesty contract).
          "/proj/src/broken.ts":
            "async function work(): Promise<number> {\n  return 1;\n}\nexport function run(): void {\n  const n: number = 'not a number';\n  work();\n}\n",
        });
        const result = yield* run(tree, "/proj");

        const ids = ruleIds(result.diagnostics);
        // The would-be TYP finding must NOT appear as a diagnostic …
        expect(ids.has("no-floating-promises")).toBe(false);
        // … it must appear as a SKIPPED check with the NO_TYPECHECK reason.
        expect(result.skippedChecks).toContain("no-floating-promises");
        expect(result.skippedCheckReasons?.["no-floating-promises"]).toBe(
          SKIP_REASON_NO_TYPECHECK,
        );
        expect(result.scorePartial).toBe(true);
        expect(result.score?.partial).toBe(true);
      }),
  );

  it.effect(
    "--no-deep (deep:false) → Tier-2 skipped + scorePartial=true even when the source would type-check",
    () =>
      Effect.gen(function* () {
        const tree = makeTree({
          "/proj/tsconfig.json": STRICT_TSCONFIG,
          "/proj/src/async.ts":
            "async function work(): Promise<number> {\n  return 1;\n}\nexport function run(): void {\n  work();\n}\n",
        });
        const result = yield* run(tree, "/proj", { deep: false });

        const ids = ruleIds(result.diagnostics);
        expect(ids.has("no-floating-promises")).toBe(false);
        expect(result.skippedChecks).toContain("no-floating-promises");
        // FAITHFUL TO LEGACY: with `deep:false` the engine builds NO Program (the build is
        // `deep !== false && files.length > 0`), so `typecheck:ok` is never PROVEN — the
        // token is absent and the planner records the NO_TYPECHECK reason, NOT NO_DEEP.
        // (NO_DEEP is only reachable when `typecheck:ok` is ALREADY in caps but deep=false,
        // which `runEngine` can't produce since the build is what proves the token. That
        // pure NO_DEEP path is pinned at the planner level in runEngine.test.ts.) Legacy's
        // own `--no-deep` engine test (engine.test.ts:28-39) asserts exactly this shape.
        expect(result.skippedCheckReasons?.["no-floating-promises"]).toBe(
          SKIP_REASON_NO_TYPECHECK,
        );
        expect(result.scorePartial).toBe(true);
      }),
  );
});

describe("diagnose — discovery error channel", () => {
  it.effect("no tsconfig.json → fails with TsconfigNotFoundError on the error channel", () =>
    Effect.gen(function* () {
      const tree = makeTree({ "/proj/src/x.ts": "export const x = 1;\n" });
      const exit = yield* run(tree, "/proj").pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
      // The failure carries the discovery tag.
      const cause = JSON.stringify(exit);
      expect(cause).toContain("TsconfigNotFoundError");
    }),
  );
});

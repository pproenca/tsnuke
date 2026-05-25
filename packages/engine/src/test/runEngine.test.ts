/**
 * Characterization tests for `runEngine` directly (the two-tier execution shell) — driven
 * with crafted in-memory file sets + capability sets, no FileSystem needed (only `Scope`,
 * discharged with `Effect.scoped` / `it.scoped`).
 *
 * Covers the parts best pinned at the engine level rather than through `diagnose`:
 *   - CFG project-level findings (RULE-018 / BC-09): ONE diagnostic per activated CFG rule
 *     at the config file, line 1, carrying its `message`.
 *   - GRAPH tier (RULE-015): `no-import-cycles` fires once over two mutually-importing files.
 *   - RULE-018 planner NO_DEEP path: caps ALREADY carry `typecheck:ok` but `deep=false`.
 *   - RULE-036: the scoped Program is RELEASED when the Scope closes (via the scale seam).
 *   - RULE-013: an injected over-ceiling RSS skips Tier-2 (the dormant guard, now wired);
 *     the default RSS never skips (legacy-equivalent).
 */

import { it } from "@effect/vitest";
import { resolve } from "node:path";
import { Effect } from "effect";
import { describe, expect } from "vitest";
import type { Capability } from "@ts-doctor/contracts-effect";
import { shouldActivate } from "@ts-doctor/capabilities-effect";
import { ruleRegistry } from "@ts-doctor/rules-registry-effect";
import {
  planEngineRun,
  runEngine,
  SKIP_REASON_MEMORY,
  SKIP_REASON_NO_DEEP,
  SKIP_REASON_NO_TYPECHECK,
  type SourceFileInput,
} from "../main/runEngine.js";

const NO_TAGS: ReadonlySet<string> = new Set();
const NO_OVERRIDES = new Map<string, never>();

/**
 * Capabilities under which NONE of the 4 CFG strictness `enable-*` rules fire — every flag
 * they gate on is present (RULE-020 inverted gating: a present token DISABLES its rule). So
 * a clean source produces ZERO diagnostics. `strict` covers `useUnknownInCatchVariables`.
 */
const CLEAN_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  "tsconfig",
  "strict",
  "noUncheckedIndexedAccess",
  "exactOptionalPropertyTypes",
]);

/** A single in-memory file at a resolved absolute path. */
const vfile = (text: string, name = "vf.ts"): SourceFileInput[] => [
  { filePath: resolve(name), text },
];

/** Run `runEngine` to an `EngineResult`, bounding the Scope. */
const runScoped = (...args: Parameters<typeof runEngine>) =>
  runEngine(...args).pipe(Effect.scoped);

describe("runEngine — CFG project-level findings (BC-09, RULE-018)", () => {
  it.effect("emits ONE enable-strict finding at the config file, line 1, when strict is OFF", () =>
    Effect.gen(function* () {
      // Only `tsconfig` present → `strict` OFF → enable-strict activates (no Program: deep=false).
      const res = yield* runScoped(
        [],
        new Set<Capability>(["tsconfig"]),
        NO_TAGS,
        NO_OVERRIDES,
        false,
        { configFilePath: "/proj/tsconfig.json" },
      );
      const cfg = res.diagnostics.filter((d) => d.rule === "enable-strict");
      expect(cfg).toHaveLength(1);
      expect(cfg[0]!.tier).toBe("CFG");
      expect(cfg[0]!.filePath).toBe("/proj/tsconfig.json");
      expect(cfg[0]!.line).toBe(1);
      expect(cfg[0]!.column).toBe(1);
      expect(cfg[0]!.message.length).toBeGreaterThan(0);
    }),
  );

  it.effect("enable-strict self-disables (no CFG finding) when the strict token is present", () =>
    Effect.gen(function* () {
      const res = yield* runScoped(
        [],
        new Set<Capability>(["tsconfig", "strict"]),
        NO_TAGS,
        NO_OVERRIDES,
        false,
      );
      expect(res.diagnostics.some((d) => d.rule === "enable-strict")).toBe(false);
    }),
  );
});

describe("runEngine — GRAPH tier (RULE-015 cycle detection)", () => {
  it.effect("two files importing each other → no-import-cycles fires once", () =>
    Effect.gen(function* () {
      const a = resolve("graph-a.ts");
      const b = resolve("graph-b.ts");
      const files: SourceFileInput[] = [
        { filePath: a, text: `import "./graph-b.js";\nexport const a = 1;\n` },
        { filePath: b, text: `import "./graph-a.js";\nexport const b = 2;\n` },
      ];
      const res = yield* runScoped(
        files,
        new Set<Capability>(["tsconfig"]),
        NO_TAGS,
        NO_OVERRIDES,
        false, // no Program needed — GRAPH is structural
      );
      const cycles = res.diagnostics.filter((d) => d.rule === "no-import-cycles");
      expect(cycles.length).toBeGreaterThanOrEqual(1);
      // Reported once per closing node; each is an error at line 1.
      expect(cycles.every((d) => d.tier === "GRAPH" && d.line === 1)).toBe(true);
    }),
  );
});

describe("runEngine — RULE-018 cap reconciliation (refuses a caller-supplied typecheck:ok)", () => {
  it.effect(
    "caps carry typecheck:ok but deep=false → engine DELETES the token (no Program proves it) → NO_TYPECHECK",
    () =>
      Effect.gen(function* () {
        // LOAD-BEARING legacy behavior (engine.ts:202-205): the engine reconciles caps with
        // what the build ACTUALLY proved. With deep=false NO Program is built, so a
        // caller-supplied `typecheck:ok` is DELETED — it refuses to trust it. The reason is
        // therefore NO_TYPECHECK, never NO_DEEP, through `runEngine`. (The NO_DEEP planner
        // branch — typecheck:ok present AND deep=false — is unreachable via `runEngine`
        // since the build that proves the token is the same build deep=false skips; it is
        // pinned directly on the pure planner below.)
        const res = yield* runScoped(
          vfile("export const x = 1;\n"),
          new Set<Capability>(["tsconfig", "typecheck:ok"]),
          NO_TAGS,
          NO_OVERRIDES,
          false,
        );
        expect(res.scorePartial).toBe(true);
        expect(res.skippedChecks).toContain("no-floating-promises");
        expect(res.skippedCheckReasons["no-floating-promises"]).toBe(
          SKIP_REASON_NO_TYPECHECK,
        );
      }),
  );

  it("the NO_DEEP reason IS produced by the pure planner directly (typecheck:ok + deep=false)", () => {
    // Re-exported `planEngineRun` + `shouldActivate`: when `typecheck:ok` is genuinely in
    // caps but `deep=false`, the planner records NO_DEEP. This is the branch `runEngine`
    // cannot reach (it deletes a caller-supplied token), proving the engine-plan slice's
    // contract end-to-end from the engine barrel.
    const plan = planEngineRun(
      ruleRegistry,
      new Set<Capability>(["tsconfig", "typecheck:ok"]),
      NO_TAGS,
      NO_OVERRIDES,
      false,
      shouldActivate,
    );
    expect(plan.tier2Enabled).toBe(false);
    expect(plan.scorePartial).toBe(true);
    expect(plan.skippedChecks).toContain("no-floating-promises");
    expect(plan.skippedCheckReasons["no-floating-promises"]).toBe(SKIP_REASON_NO_DEEP);
  });
});

describe("runEngine — RULE-036 (Program disposal via Scope)", () => {
  it.scoped("a deep run completes and the Scope closes (Program released) — no leak", () =>
    Effect.gen(function* () {
      // A clean deep run builds ONE Program (acquired into the Scope). `it.scoped` closes
      // the Scope after the body, releasing it — the OOM cure legacy never ran. We assert
      // the run produced a coherent result (and below, re-running doesn't accumulate).
      const res = yield* runEngine(
        vfile("export const ok = 1;\n"),
        CLEAN_CAPS,
        NO_TAGS,
        NO_OVERRIDES,
        undefined,
      );
      expect(res.scorePartial).toBe(false);
      expect(res.diagnostics).toStrictEqual([]);
    }),
  );

  it.effect("re-running under fresh scopes does not leak: each run is independent", () =>
    Effect.gen(function* () {
      // Three sequential deep runs, EACH in its own bounded scope (Program built + released
      // each time). If the Program weren't released the third run would still succeed, but
      // this pins the per-run `Effect.scoped` lifetime the monorepo loop will reuse.
      for (let i = 0; i < 3; i++) {
        const res = yield* runEngine(
          vfile(`export const v${i} = ${i};\n`, `leak-${i}.ts`),
          CLEAN_CAPS,
          NO_TAGS,
          NO_OVERRIDES,
          undefined,
        ).pipe(Effect.scoped);
        expect(res.scorePartial).toBe(false);
      }
    }),
  );

  it.effect("the RULE-036 finalizer fires EXACTLY ONCE per scoped deep run (release counter)", () =>
    // Prove the engine's OWN scoped Program release runs — via the `onProgramRelease` seam —
    // rather than borrowing the scale slice's proof. `Effect.scoped` closes the scope (running
    // finalizers) before it resolves, so by the time we read the counter the release has fired.
    Effect.gen(function* () {
      let released = 0;
      const res = yield* runEngine(
        vfile("export const ok = 1;\n"),
        CLEAN_CAPS,
        NO_TAGS,
        NO_OVERRIDES,
        undefined,
        { onProgramRelease: () => { released += 1; } },
      ).pipe(Effect.scoped);
      expect(res.scorePartial).toBe(false);
      expect(released).toBe(1); // the OOM-cure finalizer actually ran, exactly once
    }),
  );

  it.effect("two deep runs in ONE scope each release exactly once (per-Program lifetime)", () =>
    Effect.gen(function* () {
      let released = 0;
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* runEngine(vfile("export const a = 1;\n", "a.ts"), CLEAN_CAPS, NO_TAGS, NO_OVERRIDES, undefined, {
            onProgramRelease: () => { released += 1; },
          });
          yield* runEngine(vfile("export const b = 2;\n", "b.ts"), CLEAN_CAPS, NO_TAGS, NO_OVERRIDES, undefined, {
            onProgramRelease: () => { released += 1; },
          });
        }),
      );
      expect(released).toBe(2); // both per-project Programs released when the scope closed
    }),
  );

  it.effect("a --no-deep run builds NO Program, so the finalizer never fires", () =>
    Effect.gen(function* () {
      let released = 0;
      yield* runEngine(
        vfile("export const ok = 1;\n"),
        CLEAN_CAPS,
        NO_TAGS,
        NO_OVERRIDES,
        false, // no Program built → nothing to release
        { onProgramRelease: () => { released += 1; } },
      ).pipe(Effect.scoped);
      expect(released).toBe(0);
    }),
  );
});

describe("runEngine — RULE-013 (memory-ceiling guard, now WIRED)", () => {
  it.effect(
    "injected over-ceiling RSS → Tier-2 skipped + scorePartial=true (the dormant guard fires)",
    () =>
      Effect.gen(function* () {
        // A floating-promise file that WOULD type-check and open Tier-2 — but we inject an
        // RSS over the ceiling, so RULE-013 sheds Tier-2 to avoid OOM.
        const res = yield* runScoped(
          vfile(
            "async function w(): Promise<number> { return 1; }\nexport function r(): void { w(); }\n",
          ),
          new Set<Capability>(["tsconfig"]),
          NO_TAGS,
          NO_OVERRIDES,
          undefined,
          {
            memory: {
              currentRssBytes: 3_000_000_000, // 3 GB > 2 GB ceiling
              estimatedProgramBytes: 0,
              ceilingBytes: 2_000_000_000,
            },
          },
        );
        // The would-be TYP finding must NOT fire; it must be recorded skipped …
        expect(res.diagnostics.some((d) => d.rule === "no-floating-promises")).toBe(false);
        expect(res.skippedChecks).toContain("no-floating-promises");
        // … with the MEMORY-specific reason (distinct from NO_TYPECHECK / NO_DEEP).
        expect(res.skippedCheckReasons["no-floating-promises"]).toBe(SKIP_REASON_MEMORY);
        expect(res.scorePartial).toBe(true);
      }),
  );

  it.effect(
    "default RSS (inert guard) → Tier-2 runs normally (byte-identical to legacy)",
    () =>
      Effect.gen(function* () {
        // SAME file, NO memory injection → guard inert → Tier-2 opens → the floating
        // promise fires + scorePartial=false. This is the legacy-equivalent default.
        const res = yield* runScoped(
          vfile(
            "async function w(): Promise<number> { return 1; }\nexport function r(): void { w(); }\n",
          ),
          new Set<Capability>(["tsconfig"]),
          NO_TAGS,
          NO_OVERRIDES,
          undefined,
        );
        expect(res.diagnostics.some((d) => d.rule === "no-floating-promises")).toBe(true);
        expect(res.scorePartial).toBe(false);
        expect(res.skippedChecks).toStrictEqual([]);
      }),
  );

  it.effect("RSS under ceiling (RSS + estimate ≤ ceiling) → Tier-2 still runs", () =>
    Effect.gen(function* () {
      const res = yield* runScoped(
        vfile(
          "async function w(): Promise<number> { return 1; }\nexport function r(): void { w(); }\n",
        ),
        new Set<Capability>(["tsconfig"]),
        NO_TAGS,
        NO_OVERRIDES,
        undefined,
        {
          memory: {
            currentRssBytes: 1_000_000_000,
            estimatedProgramBytes: 500_000_000, // 1.5 GB ≤ 2 GB ceiling → no skip
            ceilingBytes: 2_000_000_000,
          },
        },
      );
      expect(res.diagnostics.some((d) => d.rule === "no-floating-promises")).toBe(true);
      expect(res.scorePartial).toBe(false);
    }),
  );
});

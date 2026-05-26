/**
 * THE EQUIVALENCE PROOF — differential test, modern vs legacy oracle (RULE-018).
 *
 * Goal: prove the Effect-TS `planEngineRun` is byte-for-byte equivalent to the
 * legacy `engine-plan.ts` algorithm in EVERY cell of a crafted finite matrix.
 * This transformation has ZERO intentional behavioral deviations — the only change
 * is consuming the capabilities slice's `resolveSeverity` instead of legacy's
 * byte-identical PRIVATE copy. Expected divergence: 0.
 *
 * Strategy:
 *   1. Vendored, frozen copy of the legacy algorithm as the oracle: legacy
 *      `planEngineRun` (engine-plan.ts:82-141) AND its PRIVATE `resolveSeverity`
 *      (engine-plan.ts:59-65). For differential testing ONLY — do NOT "fix" it.
 *   2. A crafted matrix:
 *        rule sets (mixed SYN/CFG/GRAPH/TYP, incl. duplicate/empty/off cases)
 *        × cap sets (typecheck:ok present/absent × other tokens)
 *        × ignoredTags subsets
 *        × overrides subsets (incl. "off")
 *        × deep ∈ { true, false, undefined }
 *      asserting the FULL EnginePlan deep-equals in every cell.
 *   3. Run BOTH predicates: the REAL `shouldActivate` (from the consumed slice) AND
 *      a trivial injected predicate. The same oracle is fed the SAME predicate, so
 *      the proof isolates the planner's wiring (not the predicate).
 */

import { describe, expect, it } from "vitest";
import { shouldActivate } from "@tsnuke/capabilities-effect";
import { planEngineRun } from "../main/index.js";
import type {
  ActivatePredicate,
  Capability,
  EnginePlan,
  RuleMeta,
  Severity,
  SeverityOverrides,
} from "../main/index.js";

type Tier = RuleMeta["tier"];

// ===========================================================================
// ORACLE — frozen copy of legacy/tsnuke/packages/core/src/engine-plan.ts.
// planEngineRun (:82-141) + its PRIVATE resolveSeverity (:59-65) + the two
// constants (:20-29). For differential testing ONLY — do not refactor or "fix" it.
// ===========================================================================
const LEGACY_TIER1_TIERS: ReadonlySet<Tier> = new Set<Tier>(["SYN", "CFG", "GRAPH"]);
const LEGACY_TIER2_TIER: Tier = "TYP";

const LEGACY_SKIP_REASON_NO_TYPECHECK =
  "Tier-2 (type-aware) skipped: project does not type-check (typecheck:ok absent).";
const LEGACY_SKIP_REASON_NO_DEEP =
  "Tier-2 (type-aware) skipped: --no-deep (type-aware pass disabled).";

function legacyResolveSeverity(
  meta: RuleMeta,
  explicit: Severity | "off" | undefined,
): Severity | null {
  if (explicit === "off") return null;
  return explicit ?? meta.severity;
}

function legacyPlanEngineRun(
  rules: readonly RuleMeta[],
  caps: ReadonlySet<Capability>,
  ignoredTags: ReadonlySet<string>,
  overrides: SeverityOverrides,
  deep: boolean | undefined,
  activate: ActivatePredicate,
): EnginePlan {
  const tier1: { meta: RuleMeta; severity: Severity }[] = [];
  const tier2: { meta: RuleMeta; severity: Severity }[] = [];
  const activatedTyp: RuleMeta[] = [];

  const typecheckOk = caps.has("typecheck:ok");
  const tier2Enabled = typecheckOk && deep !== false;

  const capsForTyp: ReadonlySet<Capability> = typecheckOk
    ? caps
    : new Set<Capability>([...caps, "typecheck:ok"]);

  for (const meta of rules) {
    const explicit = overrides.get(meta.id);

    if (meta.tier === LEGACY_TIER2_TIER) {
      if (!activate(meta, capsForTyp, ignoredTags, explicit)) continue;
      const severity = legacyResolveSeverity(meta, explicit);
      if (severity === null) continue; // turned off
      activatedTyp.push(meta);
      if (tier2Enabled) tier2.push({ meta, severity });
    } else if (LEGACY_TIER1_TIERS.has(meta.tier)) {
      if (!activate(meta, caps, ignoredTags, explicit)) continue;
      const severity = legacyResolveSeverity(meta, explicit);
      if (severity === null) continue; // turned off
      tier1.push({ meta, severity });
    }
  }

  const skippedCheckReasons: Record<string, string> = {};
  const skippedChecks: string[] = [];
  if (!tier2Enabled) {
    const reason = !typecheckOk
      ? LEGACY_SKIP_REASON_NO_TYPECHECK
      : LEGACY_SKIP_REASON_NO_DEEP;
    for (const meta of activatedTyp) {
      skippedCheckReasons[meta.id] = reason;
      skippedChecks.push(meta.id);
    }
  }

  return {
    tier1,
    tier2,
    tier2Enabled,
    skippedCheckReasons,
    skippedChecks,
    scorePartial: skippedChecks.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Matrix builders.
// ---------------------------------------------------------------------------

/** Powerset of an array (every subset), each materialized as a Set. */
function powersetOfSets<T>(items: readonly T[]): ReadonlySet<T>[] {
  const out: ReadonlySet<T>[] = [];
  const n = items.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const s = new Set<T>();
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) s.add(items[i] as T);
    }
    out.push(s);
  }
  return out;
}

const base = { severity: "warning" as Severity, category: "test" };
function r(over: Partial<RuleMeta> & Pick<RuleMeta, "id" | "tier">): RuleMeta {
  return { ...base, ...over } satisfies RuleMeta;
}

// A crafted catalog spanning every tier, presence/absence of gating fields, the
// canonical TYP `requires:["typecheck:ok"]` shape, a TYP rule with an EXTRA
// requirement (probes that the synthetic injection adds ONLY typecheck:ok), a
// tagged rule (exercises ignoredTags), and the RULE-020 inverted-gating CFG shape.
const RULE_SETS: ReadonlyArray<{ name: string; rules: RuleMeta[] }> = [
  { name: "empty", rules: [] },
  { name: "single SYN", rules: [r({ id: "syn-1", tier: "SYN" })] },
  {
    name: "one per Tier-1 tier",
    rules: [
      r({ id: "syn-1", tier: "SYN" }),
      r({ id: "cfg-1", tier: "CFG" }),
      r({ id: "graph-1", tier: "GRAPH" }),
    ],
  },
  {
    name: "single TYP requiring typecheck:ok",
    rules: [r({ id: "typ-1", tier: "TYP", requires: ["typecheck:ok"] })],
  },
  {
    name: "mixed Tier-1 + multiple TYP (input order matters)",
    rules: [
      r({ id: "typ-1", tier: "TYP", requires: ["typecheck:ok"] }),
      r({ id: "syn-1", tier: "SYN" }),
      r({ id: "typ-2", tier: "TYP", requires: ["typecheck:ok"], severity: "error" }),
      r({ id: "graph-1", tier: "GRAPH" }),
    ],
  },
  {
    name: "TYP with EXTRA requirement (synthetic injects only typecheck:ok)",
    rules: [
      r({ id: "typ-strict", tier: "TYP", requires: ["typecheck:ok", "strict"] }),
      r({ id: "typ-plain", tier: "TYP", requires: ["typecheck:ok"] }),
    ],
  },
  {
    name: "tagged rules (exercise ignoredTags) across tiers",
    rules: [
      r({ id: "syn-tagged", tier: "SYN", tags: ["style"] }),
      r({ id: "typ-tagged", tier: "TYP", requires: ["typecheck:ok"], tags: ["pedantic"] }),
    ],
  },
  {
    name: "RULE-020 inverted-gating CFG + disabledBy",
    rules: [
      r({ id: "enable-strict", tier: "CFG", requires: ["tsconfig"], disabledBy: ["strict"] }),
      r({ id: "graph-1", tier: "GRAPH", disabledBy: ["noise"] }),
    ],
  },
  {
    name: "duplicate ids across tiers (last-write-wins in reasons map)",
    rules: [
      r({ id: "dup", tier: "TYP", requires: ["typecheck:ok"] }),
      r({ id: "dup", tier: "TYP", requires: ["typecheck:ok"], severity: "error" }),
    ],
  },
  {
    name: "unknown tier dropped + opt-in defaultEnabled:false",
    rules: [
      r({ id: "weird", tier: "MYSTERY" as Tier }),
      r({ id: "optin", tier: "SYN", defaultEnabled: false }),
      r({ id: "typ-1", tier: "TYP", requires: ["typecheck:ok"] }),
    ],
  },
];

// Cap universe deliberately includes typecheck:ok (the Tier-2 gate) + the tokens
// the rule sets gate on (tsconfig/strict/noise) so requires/disabledBy flip both ways.
const CAP_UNIVERSE = ["typecheck:ok", "tsconfig", "strict", "noise"] as const;
const TAG_UNIVERSE = ["style", "pedantic"] as const;
const ALL_CAP_SETS = powersetOfSets(CAP_UNIVERSE); // 2^4 = 16
const ALL_TAG_SETS = powersetOfSets(TAG_UNIVERSE); // 2^2 = 4
const DEEPS: readonly (boolean | undefined)[] = [true, false, undefined];

// Override matrix: a small set of representative override maps. We key overrides on
// ids the rule sets actually use, including "off" and a real severity bump.
const OVERRIDE_SETS: ReadonlyArray<{ name: string; map: SeverityOverrides }> = [
  { name: "none", map: new Map() },
  { name: "syn-1 off", map: new Map<string, Severity | "off">([["syn-1", "off"]]) },
  { name: "typ-1 off", map: new Map<string, Severity | "off">([["typ-1", "off"]]) },
  { name: "typ-1 error", map: new Map<string, Severity | "off">([["typ-1", "error"]]) },
  {
    name: "several",
    map: new Map<string, Severity | "off">([
      ["syn-1", "error"],
      ["typ-2", "off"],
      ["enable-strict", "off"],
      ["optin", "warning"],
    ]),
  },
];

const PREDICATES: ReadonlyArray<{ name: string; fn: ActivatePredicate }> = [
  { name: "real shouldActivate", fn: shouldActivate },
  { name: "trivial allOn", fn: () => true },
];

describe("equivalence — RULE-018 exhaustive differential (modern === legacy, 0 divergence)", () => {
  for (const predicate of PREDICATES) {
    it(`planEngineRun matches the frozen legacy oracle in every cell — ${predicate.name}`, () => {
      let cells = 0;
      let diverged = 0;
      let sawTier2Open = 0;
      let sawSkipped = 0;
      let sawTier1 = 0;

      for (const ruleSet of RULE_SETS) {
        for (const caps of ALL_CAP_SETS) {
          for (const ignoredTags of ALL_TAG_SETS) {
            for (const overrides of OVERRIDE_SETS) {
              for (const deep of DEEPS) {
                const modern = planEngineRun(
                  ruleSet.rules,
                  caps,
                  ignoredTags,
                  overrides.map,
                  deep,
                  predicate.fn,
                );
                const legacy = legacyPlanEngineRun(
                  ruleSet.rules,
                  caps,
                  ignoredTags,
                  overrides.map,
                  deep,
                  predicate.fn,
                );

                if (JSON.stringify(modern) !== JSON.stringify(legacy)) diverged++;
                expect(
                  modern,
                  `divergence: ruleSet=${ruleSet.name} caps=[${[...caps]}] tags=[${[...ignoredTags]}] overrides=${overrides.name} deep=${String(deep)}`,
                ).toStrictEqual(legacy);

                if (modern.tier2Enabled && modern.tier2.length > 0) sawTier2Open++;
                if (modern.skippedChecks.length > 0) sawSkipped++;
                if (modern.tier1.length > 0) sawTier1++;
                cells++;
              }
            }
          }
        }
      }

      // Harness self-guards: full grid traversed, zero divergence, and the key
      // outcomes actually occurred (so a degenerate all-empty pass can't slip by).
      expect(cells).toBe(
        RULE_SETS.length *
          ALL_CAP_SETS.length *
          ALL_TAG_SETS.length *
          OVERRIDE_SETS.length *
          DEEPS.length,
      );
      expect(cells).toBe(10 * 16 * 4 * 5 * 3); // = 9600
      expect(diverged).toBe(0);
      expect(sawTier2Open).toBeGreaterThan(0);
      expect(sawSkipped).toBeGreaterThan(0);
      expect(sawTier1).toBeGreaterThan(0);
    });
  }

  it("modern skip-reason constants equal the frozen oracle constants verbatim", () => {
    // Imported transitively via the same module the impl uses; assert byte-identity
    // with the vendored oracle strings so a message drift would fail loudly.
    const modern = planEngineRun(
      [r({ id: "typ-1", tier: "TYP", requires: ["typecheck:ok"] })],
      new Set<Capability>(), // typecheck:ok absent → NO_TYPECHECK
      new Set<string>(),
      new Map(),
      undefined,
      () => true,
    );
    expect(modern.skippedCheckReasons["typ-1"]).toBe(LEGACY_SKIP_REASON_NO_TYPECHECK);

    const noDeep = planEngineRun(
      [r({ id: "typ-1", tier: "TYP", requires: ["typecheck:ok"] })],
      new Set<Capability>(["typecheck:ok"]),
      new Set<string>(),
      new Map(),
      false, // deep false → NO_DEEP
      () => true,
    );
    expect(noDeep.skippedCheckReasons["typ-1"]).toBe(LEGACY_SKIP_REASON_NO_DEEP);
  });
});

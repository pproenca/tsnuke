/**
 * THE EQUIVALENCE PROOF — differential test, modern vs legacy oracle (RULE-019/020).
 *
 * Goal: prove the Effect-TS `shouldActivate` / `resolveSeverity` are byte-for-byte
 * equivalent to the legacy algorithm in EVERY cell of a crafted finite matrix.
 * Unlike the scoring slice, this transformation has ZERO intentional deviations —
 * the predicate's behavior (and its load-bearing short-circuit order) is preserved
 * exactly. Expected divergence: 0.
 *
 * Strategy:
 *   1. Vendored, frozen copy of legacy `shouldActivate`/`resolveSeverity`
 *      (legacy/.../capabilities.ts:23-71) as the oracle — do NOT "fix" it.
 *   2. EXHAUSTIVE enumeration of a finite cross-product:
 *        rule metas (requires? × disabledBy? × tags? × defaultEnabled?)
 *        × cap sets (every subset of a small token universe)
 *        × ignoredTags (every subset of a small tag universe)
 *        × explicit ∈ { undefined, "off", "error", "warning" }
 *      asserting modern === legacy in EVERY cell.
 *   3. The token universe deliberately includes the exact tokens the rule metas
 *      reference, so the requires/disabledBy gates are exercised both satisfied
 *      and unsatisfied (incl. the RULE-020 inverted case requires:["tsconfig"]
 *      + disabledBy:["strict"], active iff "strict" absent).
 */

import { describe, expect, it } from "vitest";
import { resolveSeverity, shouldActivate } from "../main/index.js";
import type { RuleMeta, Severity } from "../main/index.js";

// ---------------------------------------------------------------------------
// ORACLE: frozen copy of legacy/ts-doctor/packages/ts-doctor-rules/src/capabilities.ts:23-71.
// For differential testing ONLY — do not refactor or "improve" it.
// ---------------------------------------------------------------------------
function legacyShouldActivate(
  rule: RuleMeta,
  caps: ReadonlySet<string>,
  ignoredTags: ReadonlySet<string>,
  explicit?: Severity | "off",
): boolean {
  // 5. explicit off wins outright.
  if (explicit === "off") return false;

  // 1. requires: ALL must be present.
  if (rule.requires) {
    for (const cap of rule.requires) {
      if (!caps.has(cap)) return false;
    }
  }

  // 2. disabledBy: ANY present disables (this is the inverted-gating mechanism).
  if (rule.disabledBy) {
    for (const cap of rule.disabledBy) {
      if (caps.has(cap)) return false;
    }
  }

  // 3. ignored tags: ANY overlap disables.
  if (rule.tags) {
    for (const tag of rule.tags) {
      if (ignoredTags.has(tag)) return false;
    }
  }

  // 4. opt-in rules need an explicit severity to turn on.
  if (rule.defaultEnabled === false && explicit === undefined) return false;

  return true;
}

function legacyResolveSeverity(
  rule: RuleMeta,
  explicit?: Severity | "off",
): Severity | null {
  if (explicit === "off") return null;
  return explicit ?? rule.severity;
}

// ---------------------------------------------------------------------------
// Finite matrix builders.
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

const base = {
  id: "r",
  severity: "warning" as Severity,
  category: "test",
  tier: "SYN" as const,
};

// The token universe — chosen so it INTERSECTS the rule metas' requires/disabledBy
// tokens (so those gates flip both ways) plus a couple of neutral extras.
const CAP_UNIVERSE = ["tsconfig", "strict", "typecheck:ok", "noise"] as const;
const TAG_UNIVERSE = ["style", "pedantic", "x"] as const;
const ALL_CAP_SETS = powersetOfSets(CAP_UNIVERSE); // 2^4 = 16
const ALL_TAG_SETS = powersetOfSets(TAG_UNIVERSE); // 2^3 = 8
const EXPLICITS: readonly (Severity | "off" | undefined)[] = [
  undefined,
  "off",
  "error",
  "warning",
];

// A crafted set of rule metas spanning the presence/absence of every gating field,
// the AND/OR multiplicities, the empty-array edge cases, and both default-enabled
// states — INCLUDING the canonical RULE-020 inverted-gating shape.
const RULE_METAS: readonly RuleMeta[] = [
  // bare — no gates set
  { ...base } as RuleMeta,
  { ...base, severity: "error" } as RuleMeta,
  // requires
  { ...base, requires: ["tsconfig"] } as RuleMeta,
  { ...base, requires: ["tsconfig", "typecheck:ok"] } as RuleMeta,
  { ...base, requires: [] } as RuleMeta, // empty-array edge
  // disabledBy
  { ...base, disabledBy: ["strict"] } as RuleMeta,
  { ...base, disabledBy: ["strict", "noise"] } as RuleMeta,
  { ...base, disabledBy: [] } as RuleMeta, // empty-array edge
  // tags
  { ...base, tags: ["style"] } as RuleMeta,
  { ...base, tags: ["style", "pedantic"] } as RuleMeta,
  { ...base, tags: [] } as RuleMeta, // empty-array edge
  // defaultEnabled (incl. the KNOWN dead branch: false)
  { ...base, defaultEnabled: true } as RuleMeta,
  { ...base, defaultEnabled: false } as RuleMeta,
  // RULE-020 inverted-gating canonical shape (+ a dual-gate variant)
  {
    ...base,
    id: "enable-strict",
    tier: "CFG",
    requires: ["tsconfig"],
    disabledBy: ["strict"],
  } as RuleMeta,
  {
    ...base,
    id: "enable-use-unknown-in-catch",
    tier: "CFG",
    requires: ["tsconfig"],
    disabledBy: ["useUnknownInCatchVariables", "strict"],
  } as RuleMeta,
  // every gate set at once (cross-interaction)
  {
    ...base,
    requires: ["tsconfig"],
    disabledBy: ["strict"],
    tags: ["style"],
    defaultEnabled: false,
  } as RuleMeta,
];

describe("equivalence — RULE-019/020 exhaustive differential (modern === legacy, 0 divergence)", () => {
  it("shouldActivate matches the frozen legacy oracle in every cell", () => {
    let cells = 0;
    let diverged = 0;
    let activeTrue = 0;
    let activeFalse = 0;

    for (const rule of RULE_METAS) {
      for (const caps of ALL_CAP_SETS) {
        for (const ignoredTags of ALL_TAG_SETS) {
          for (const explicit of EXPLICITS) {
            const modern = shouldActivate(rule, caps, ignoredTags, explicit);
            const legacy = legacyShouldActivate(rule, caps, ignoredTags, explicit);
            if (modern !== legacy) diverged++;
            expect(
              modern,
              `divergence: rule=${rule.id} caps=${[...caps]} tags=${[...ignoredTags]} explicit=${String(explicit)}`,
            ).toBe(legacy);
            if (modern) activeTrue++;
            else activeFalse++;
            cells++;
          }
        }
      }
    }

    // Harness self-guards: the full grid was traversed, zero divergence, and BOTH
    // outcomes actually occurred (so an all-true / all-false bug couldn't pass).
    expect(cells).toBe(
      RULE_METAS.length * ALL_CAP_SETS.length * ALL_TAG_SETS.length * EXPLICITS.length,
    );
    expect(cells).toBe(16 * 16 * 8 * 4); // = 8192
    expect(diverged).toBe(0);
    expect(activeTrue).toBeGreaterThan(0);
    expect(activeFalse).toBeGreaterThan(0);
  });

  it("resolveSeverity matches the frozen legacy oracle in every cell", () => {
    let cells = 0;
    let diverged = 0;
    let sawNull = 0;
    let sawOverride = 0;
    let sawDefault = 0;

    for (const rule of RULE_METAS) {
      for (const explicit of EXPLICITS) {
        const modern = resolveSeverity(rule, explicit);
        const legacy = legacyResolveSeverity(rule, explicit);
        if (modern !== legacy) diverged++;
        expect(
          modern,
          `divergence: rule.severity=${rule.severity} explicit=${String(explicit)}`,
        ).toBe(legacy);
        if (modern === null) sawNull++;
        else if (explicit !== undefined) sawOverride++;
        else sawDefault++;
        cells++;
      }
    }

    expect(cells).toBe(RULE_METAS.length * EXPLICITS.length);
    expect(diverged).toBe(0);
    // All three resolution branches were exercised.
    expect(sawNull).toBeGreaterThan(0);
    expect(sawOverride).toBeGreaterThan(0);
    expect(sawDefault).toBeGreaterThan(0);
  });
});

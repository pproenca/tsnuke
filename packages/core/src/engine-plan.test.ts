import { describe, expect, it } from "vitest";
import type { Capability, RuleMeta } from "@ts-doctor/rules";
import {
  SKIP_REASON_NO_DEEP,
  SKIP_REASON_NO_TYPECHECK,
  planEngineRun,
  type ActivatePredicate,
  type SeverityOverrides,
} from "./engine-plan.js";

/** Trivial activation predicate: honors `requires` ⊆ caps + explicit "off". */
const activate: ActivatePredicate = (rule, caps, _ignoredTags, explicit) => {
  if (explicit === "off") return false;
  for (const r of rule.requires ?? []) if (!caps.has(r)) return false;
  return true;
};

function meta(over: Partial<RuleMeta> & Pick<RuleMeta, "id" | "tier">): RuleMeta {
  return {
    severity: "error",
    category: "Type Safety",
    ...over,
  };
}

const NO_OVERRIDES: SeverityOverrides = new Map();
const NO_TAGS = new Set<string>();

describe("planEngineRun partial honesty (BC-03)", () => {
  const rules: RuleMeta[] = [
    meta({ id: "no-ts-ignore", tier: "SYN" }),
    meta({ id: "no-floating-promise", tier: "TYP" }),
    meta({ id: "no-unnecessary-condition", tier: "TYP" }),
    meta({ id: "no-unused-export", tier: "GRAPH" }),
  ];

  it("when typecheck:ok absent → Tier-2 closed, TYP rules skipped, partial=true", () => {
    const caps = new Set<Capability>(["tsconfig", "strict"]);
    const plan = planEngineRun(rules, caps, NO_TAGS, NO_OVERRIDES, undefined, activate);

    expect(plan.tier2Enabled).toBe(false);
    expect(plan.scorePartial).toBe(true);
    // Both TYP rules are recorded as skipped with the no-typecheck reason.
    expect(plan.skippedChecks.sort()).toEqual([
      "no-floating-promise",
      "no-unnecessary-condition",
    ]);
    expect(plan.skippedCheckReasons["no-floating-promise"]).toBe(
      SKIP_REASON_NO_TYPECHECK,
    );
    // Tier-1 (SYN/GRAPH) still runs.
    expect(plan.tier1.map((t) => t.meta.id).sort()).toEqual([
      "no-ts-ignore",
      "no-unused-export",
    ]);
    expect(plan.tier2).toHaveLength(0);
  });

  it("when typecheck:ok present and deep auto → Tier-2 open, nothing skipped, partial=false", () => {
    const caps = new Set<Capability>(["tsconfig", "typecheck:ok"]);
    const plan = planEngineRun(rules, caps, NO_TAGS, NO_OVERRIDES, undefined, activate);

    expect(plan.tier2Enabled).toBe(true);
    expect(plan.scorePartial).toBe(false);
    expect(plan.skippedChecks).toHaveLength(0);
    expect(plan.tier2.map((t) => t.meta.id).sort()).toEqual([
      "no-floating-promise",
      "no-unnecessary-condition",
    ]);
  });

  it("when typecheck:ok present but deep=false → Tier-2 closed, skipped with no-deep reason", () => {
    const caps = new Set<Capability>(["tsconfig", "typecheck:ok"]);
    const plan = planEngineRun(rules, caps, NO_TAGS, NO_OVERRIDES, false, activate);

    expect(plan.tier2Enabled).toBe(false);
    expect(plan.scorePartial).toBe(true);
    expect(plan.skippedCheckReasons["no-unnecessary-condition"]).toBe(
      SKIP_REASON_NO_DEEP,
    );
  });

  it("an 'off' override removes a rule from its tier", () => {
    const caps = new Set<Capability>(["tsconfig", "typecheck:ok"]);
    const overrides: SeverityOverrides = new Map([["no-ts-ignore", "off"]]);
    const plan = planEngineRun(rules, caps, NO_TAGS, overrides, undefined, activate);
    expect(plan.tier1.map((t) => t.meta.id)).not.toContain("no-ts-ignore");
  });
});

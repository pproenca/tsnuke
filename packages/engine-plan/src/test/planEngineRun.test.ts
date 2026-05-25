/**
 * Characterization tests for the PURE two-tier engine planner (RULE-018).
 *
 * These were written BEFORE the implementation and define "done". They pin the
 * partial-honesty contract exactly: Tier-1 always runs; Tier-2 (TYP) runs only
 * when `typecheck:ok` is present AND `deep !== false`; otherwise every ACTIVATED
 * TYP rule is recorded as skipped with the right reason, and `scorePartial` is
 * true. The SYNTHETIC `capsForTyp` skip-accounting (a TYP rule counted skipped
 * even when the `typecheck:ok` token is ABSENT) is load-bearing and pinned here.
 *
 * The implementation lives at `src/main/index.ts` (imported as `../main/index.js`
 * — `.js` on relative specifiers; the `Bundler` moduleResolution resolves `.js`
 * to `.ts`). Until that module exists the suite is RED — the correct start state.
 *
 * We exercise the planner with TWO activation predicates: a trivial always-on
 * `allOn`, and the REAL `shouldActivate` consumed from `@ts-fix/capabilities-effect`.
 */

import { describe, expect, it } from "vitest";
import { shouldActivate } from "@ts-fix/capabilities-effect";
import {
  SKIP_REASON_NO_DEEP,
  SKIP_REASON_NO_TYPECHECK,
  planEngineRun,
  type ActivatePredicate,
  type Capability,
  type RuleMeta,
  type Severity,
  type SeverityOverrides,
} from "../main/index.js";

// ---------------------------------------------------------------------------
// Fixture builders.
// ---------------------------------------------------------------------------
type Tier = RuleMeta["tier"];

function rule(over: Partial<RuleMeta> & Pick<RuleMeta, "id" | "tier">): RuleMeta {
  return {
    severity: "warning",
    category: "test",
    ...over,
  } as RuleMeta;
}

/** Trivial injected predicate: everything is active (isolates the planner). */
const allOn: ActivatePredicate = () => true;

/** Trivial injected predicate: nothing is active. */
const allOff: ActivatePredicate = () => false;

const caps = (...tokens: string[]): ReadonlySet<Capability> =>
  new Set<Capability>(tokens);
const tags = (...t: string[]): ReadonlySet<string> => new Set<string>(t);
const NO_OVERRIDES: SeverityOverrides = new Map();

// Canonical rule sets. A TYP rule declares `requires:["typecheck:ok"]` exactly as
// the real catalog does — this is what the synthetic `capsForTyp` must satisfy.
const synRule = rule({ id: "syn-1", tier: "SYN" });
const cfgRule = rule({ id: "cfg-1", tier: "CFG" });
const graphRule = rule({ id: "graph-1", tier: "GRAPH" });
const typRule = rule({ id: "typ-1", tier: "TYP", requires: ["typecheck:ok"] });
const typRule2 = rule({ id: "typ-2", tier: "TYP", requires: ["typecheck:ok"] });

describe("RULE-018 — Tier-1 (SYN/CFG/GRAPH) always runs", () => {
  it("activated SYN/CFG/GRAPH rules land in tier1 regardless of typecheck:ok", () => {
    const plan = planEngineRun(
      [synRule, cfgRule, graphRule],
      caps(), // no typecheck:ok
      tags(),
      NO_OVERRIDES,
      undefined,
      allOn,
    );
    expect(plan.tier1.map((r) => r.meta.id)).toEqual(["syn-1", "cfg-1", "graph-1"]);
    expect(plan.tier2).toEqual([]);
    expect(plan.tier1.every((r) => r.severity === "warning")).toBe(true);
  });

  it("Tier-1 runs even with deep === false", () => {
    const plan = planEngineRun(
      [synRule],
      caps("typecheck:ok"),
      tags(),
      NO_OVERRIDES,
      false,
      allOn,
    );
    expect(plan.tier1.map((r) => r.meta.id)).toEqual(["syn-1"]);
  });

  it("an unknown tier is neither Tier-1 nor Tier-2 (silently dropped)", () => {
    const weird = rule({ id: "weird", tier: "MYSTERY" as Tier });
    const plan = planEngineRun(
      [weird],
      caps("typecheck:ok"),
      tags(),
      NO_OVERRIDES,
      true,
      allOn,
    );
    expect(plan.tier1).toEqual([]);
    expect(plan.tier2).toEqual([]);
    expect(plan.scorePartial).toBe(false);
  });
});

describe("RULE-018 — Tier-2 gating (typecheck:ok present + deep !== false → runs)", () => {
  it("typecheck:ok present, deep === true → TYP rule runs, nothing skipped", () => {
    const plan = planEngineRun(
      [typRule],
      caps("typecheck:ok"),
      tags(),
      NO_OVERRIDES,
      true,
      allOn,
    );
    expect(plan.tier2Enabled).toBe(true);
    expect(plan.tier2.map((r) => r.meta.id)).toEqual(["typ-1"]);
    expect(plan.skippedChecks).toEqual([]);
    expect(plan.skippedCheckReasons).toEqual({});
    expect(plan.scorePartial).toBe(false);
  });

  it("typecheck:ok present, deep === undefined (auto) → TYP rule runs", () => {
    const plan = planEngineRun(
      [typRule],
      caps("typecheck:ok"),
      tags(),
      NO_OVERRIDES,
      undefined,
      allOn,
    );
    expect(plan.tier2Enabled).toBe(true);
    expect(plan.tier2.map((r) => r.meta.id)).toEqual(["typ-1"]);
    expect(plan.scorePartial).toBe(false);
  });
});

describe("RULE-018 — Tier-2 gating (typecheck:ok absent → skipped, NO_TYPECHECK reason)", () => {
  it("typecheck:ok absent → TYP rule skipped with NO_TYPECHECK reason, scorePartial true", () => {
    const plan = planEngineRun(
      [typRule],
      caps(), // no typecheck:ok
      tags(),
      NO_OVERRIDES,
      undefined,
      allOn,
    );
    expect(plan.tier2Enabled).toBe(false);
    expect(plan.tier2).toEqual([]);
    expect(plan.skippedChecks).toEqual(["typ-1"]);
    expect(plan.skippedCheckReasons).toEqual({ "typ-1": SKIP_REASON_NO_TYPECHECK });
    expect(plan.scorePartial).toBe(true);
  });

  it("typecheck:ok absent AND deep === false → still NO_TYPECHECK (absence wins the reason)", () => {
    // tier2Enabled is false for either reason; the reason picks NO_TYPECHECK when
    // !typecheckOk, regardless of deep. (Legacy precedence: !typecheckOk first.)
    const plan = planEngineRun(
      [typRule],
      caps(),
      tags(),
      NO_OVERRIDES,
      false,
      allOn,
    );
    expect(plan.tier2Enabled).toBe(false);
    expect(plan.skippedCheckReasons).toEqual({ "typ-1": SKIP_REASON_NO_TYPECHECK });
    expect(plan.scorePartial).toBe(true);
  });
});

describe("RULE-018 — Tier-2 gating (deep === false → skipped, NO_DEEP reason even with typecheck:ok)", () => {
  it("typecheck:ok present but deep === false → TYP skipped with NO_DEEP reason", () => {
    const plan = planEngineRun(
      [typRule],
      caps("typecheck:ok"),
      tags(),
      NO_OVERRIDES,
      false,
      allOn,
    );
    expect(plan.tier2Enabled).toBe(false);
    expect(plan.tier2).toEqual([]);
    expect(plan.skippedChecks).toEqual(["typ-1"]);
    expect(plan.skippedCheckReasons).toEqual({ "typ-1": SKIP_REASON_NO_DEEP });
    expect(plan.scorePartial).toBe(true);
  });
});

describe("RULE-018 — SYNTHETIC capsForTyp skip-accounting (load-bearing)", () => {
  it("a TYP rule requiring typecheck:ok is counted SKIPPED even when the token is ABSENT", () => {
    // With the REAL predicate, requires:["typecheck:ok"] would normally filter the
    // rule out when the token is absent — but the planner injects a synthetic
    // typecheck:ok into capsForTyp so the rule's WOULD-RUN eligibility is evaluated,
    // and it is correctly accounted as skipped. The RUN stays gated on tier2Enabled.
    const plan = planEngineRun(
      [typRule],
      caps(), // typecheck:ok ABSENT
      tags(),
      NO_OVERRIDES,
      undefined,
      shouldActivate, // REAL predicate — would otherwise reject on requires
    );
    expect(plan.tier2Enabled).toBe(false);
    expect(plan.tier2).toEqual([]);
    expect(plan.skippedChecks).toEqual(["typ-1"]);
    expect(plan.skippedCheckReasons).toEqual({ "typ-1": SKIP_REASON_NO_TYPECHECK });
    expect(plan.scorePartial).toBe(true);
  });

  it("a TYP rule with OTHER unmet requirements is NOT accounted skipped (synthetic only injects typecheck:ok)", () => {
    // The synthetic injection adds ONLY typecheck:ok. A TYP rule that also requires
    // some other absent token is genuinely not-eligible and must NOT be reported.
    const typNeedsStrict = rule({
      id: "typ-strict",
      tier: "TYP",
      requires: ["typecheck:ok", "strict"],
    });
    const plan = planEngineRun(
      [typNeedsStrict],
      caps(), // neither typecheck:ok nor strict
      tags(),
      NO_OVERRIDES,
      undefined,
      shouldActivate,
    );
    expect(plan.tier2Enabled).toBe(false);
    expect(plan.skippedChecks).toEqual([]); // strict still missing → genuinely not eligible
    expect(plan.skippedCheckReasons).toEqual({});
    expect(plan.scorePartial).toBe(false);
  });

  it("multiple activated TYP rules are ALL accounted skipped, in input order", () => {
    const plan = planEngineRun(
      [typRule, synRule, typRule2],
      caps(),
      tags(),
      NO_OVERRIDES,
      undefined,
      allOn,
    );
    expect(plan.tier1.map((r) => r.meta.id)).toEqual(["syn-1"]);
    expect(plan.skippedChecks).toEqual(["typ-1", "typ-2"]);
    expect(plan.skippedCheckReasons).toEqual({
      "typ-1": SKIP_REASON_NO_TYPECHECK,
      "typ-2": SKIP_REASON_NO_TYPECHECK,
    });
    expect(plan.scorePartial).toBe(true);
  });
});

describe('RULE-018/019 — "off" override skips a rule from its tier', () => {
  it('an "off" override removes a Tier-1 rule (resolveSeverity → null)', () => {
    const overrides: SeverityOverrides = new Map([["syn-1", "off"]]);
    const plan = planEngineRun(
      [synRule, cfgRule],
      caps("typecheck:ok"),
      tags(),
      overrides,
      true,
      allOn,
    );
    expect(plan.tier1.map((r) => r.meta.id)).toEqual(["cfg-1"]);
  });

  it('an "off" override on a TYP rule removes it from tier2 AND from skip-accounting', () => {
    // resolveSeverity returns null for "off" → the rule never reaches activatedTyp,
    // so it is neither run nor reported as skipped.
    const overrides: SeverityOverrides = new Map([["typ-1", "off"]]);
    const planRun = planEngineRun(
      [typRule],
      caps("typecheck:ok"),
      tags(),
      overrides,
      true,
      allOn,
    );
    expect(planRun.tier2).toEqual([]);

    const planSkipped = planEngineRun(
      [typRule],
      caps(), // typecheck:ok absent
      tags(),
      overrides,
      undefined,
      allOn,
    );
    expect(planSkipped.skippedChecks).toEqual([]);
    expect(planSkipped.scorePartial).toBe(false);
  });

  it("a severity override (not off) is applied to the registered rule", () => {
    const overrides: SeverityOverrides = new Map<string, Severity | "off">([
      ["syn-1", "error"],
    ]);
    const plan = planEngineRun([synRule], caps(), tags(), overrides, undefined, allOn);
    expect(plan.tier1).toEqual([{ meta: synRule, severity: "error" }]);
  });
});

describe("RULE-018 — scorePartial true IFF a TYP rule was skipped", () => {
  it("scorePartial false when Tier-2 ran (no skips)", () => {
    const plan = planEngineRun(
      [typRule],
      caps("typecheck:ok"),
      tags(),
      NO_OVERRIDES,
      true,
      allOn,
    );
    expect(plan.scorePartial).toBe(false);
  });

  it("scorePartial false when there are NO TYP rules at all, even if tier2 is closed", () => {
    const plan = planEngineRun(
      [synRule, cfgRule],
      caps(), // tier2 closed
      tags(),
      NO_OVERRIDES,
      false,
      allOn,
    );
    expect(plan.tier2Enabled).toBe(false);
    expect(plan.skippedChecks).toEqual([]);
    expect(plan.scorePartial).toBe(false);
  });

  it("scorePartial true exactly when at least one TYP rule was skipped", () => {
    const plan = planEngineRun([typRule], caps(), tags(), NO_OVERRIDES, undefined, allOn);
    expect(plan.scorePartial).toBe(true);
  });
});

describe("RULE-018 — degenerate inputs", () => {
  it("empty rule set → empty plan, not partial", () => {
    const plan = planEngineRun([], caps("typecheck:ok"), tags(), NO_OVERRIDES, true, allOn);
    expect(plan).toEqual({
      tier1: [],
      tier2: [],
      tier2Enabled: true,
      skippedCheckReasons: {},
      skippedChecks: [],
      scorePartial: false,
    });
  });

  it("predicate that rejects everything → empty plan even with TYP rules and tier2 closed", () => {
    const plan = planEngineRun(
      [synRule, typRule],
      caps(),
      tags(),
      NO_OVERRIDES,
      undefined,
      allOff,
    );
    expect(plan.tier1).toEqual([]);
    expect(plan.tier2).toEqual([]);
    expect(plan.skippedChecks).toEqual([]); // nothing activated → nothing skipped
    expect(plan.scorePartial).toBe(false);
  });
});

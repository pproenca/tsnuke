/**
 * Characterization tests for `shouldActivate` — RULE-019 (universal rule-activation
 * predicate) and RULE-020 (inverted CFG gating).
 *
 * These tests DEFINE "done" for the Effect-TS rewrite: the implementation in
 * `../main/index.js` is written AFTER these tests and must make them pass.
 *
 * RULE-019's short-circuit ORDER is load-bearing — the predicate is evaluated in a
 * FIXED order and each gate can independently short-circuit to `false`:
 *   1. explicit === "off"                      -> false  (off wins outright)
 *   2. every `requires` token ∈ caps           (AND-gate, else false)
 *   3. any `disabledBy` token ∈ caps           -> false  (inverted gating, RULE-020)
 *   4. any `tags` ∈ ignoredTags                -> false
 *   5. defaultEnabled === false && explicit === undefined -> false (opt-in)
 *   6. else true.
 *
 * Each gate is tested in ISOLATION, then in COMBINATION to pin that ORDER matters
 * (e.g. "off" beats a satisfied requires; disabledBy beats requires-satisfied).
 */

import { describe, expect, it } from "vitest";
import { shouldActivate } from "../main/index.js";
import type { RuleMeta } from "../main/index.js";

/** Build a RuleMeta literal — only the activation-relevant fields matter here. */
function rule(over: Partial<RuleMeta> = {}): RuleMeta {
  return {
    id: "r",
    severity: "warning",
    category: "test",
    tier: "SYN",
    ...over,
  } satisfies RuleMeta;
}

const caps = (...tokens: string[]): ReadonlySet<string> => new Set(tokens);
const tags = (...tokens: string[]): ReadonlySet<string> => new Set(tokens);
const NO_CAPS: ReadonlySet<string> = new Set();
const NO_TAGS: ReadonlySet<string> = new Set();

describe("shouldActivate — RULE-019 gate 1 (explicit 'off' wins outright)", () => {
  it("explicit 'off' -> false even when all other gates pass", () => {
    expect(shouldActivate(rule(), NO_CAPS, NO_TAGS, "off")).toBe(false);
  });

  it("explicit 'off' beats a fully-satisfied requires (ORDER: gate 1 before gate 2)", () => {
    const r = rule({ requires: ["tsconfig"] });
    // requires IS satisfied — but off short-circuits first.
    expect(shouldActivate(r, caps("tsconfig"), NO_TAGS, "off")).toBe(false);
  });

  it("explicit 'off' beats an opt-in rule that an override would have enabled", () => {
    // gate 5 would turn this OFF anyway, but gate 1 fires first regardless.
    const r = rule({ defaultEnabled: false });
    expect(shouldActivate(r, NO_CAPS, NO_TAGS, "off")).toBe(false);
  });
});

describe("shouldActivate — RULE-019 gate 2 (requires AND-gate)", () => {
  it("no requires -> gate passes (trivially)", () => {
    expect(shouldActivate(rule(), NO_CAPS, NO_TAGS)).toBe(true);
  });

  it("single requires present -> active", () => {
    const r = rule({ requires: ["tsconfig"] });
    expect(shouldActivate(r, caps("tsconfig"), NO_TAGS)).toBe(true);
  });

  it("single requires absent -> false", () => {
    const r = rule({ requires: ["tsconfig"] });
    expect(shouldActivate(r, NO_CAPS, NO_TAGS)).toBe(false);
  });

  it("ALL requires present -> active (AND, not OR)", () => {
    const r = rule({ requires: ["tsconfig", "typecheck:ok"] });
    expect(shouldActivate(r, caps("tsconfig", "typecheck:ok"), NO_TAGS)).toBe(true);
  });

  it("ONE of several requires absent -> false (AND-gate)", () => {
    const r = rule({ requires: ["tsconfig", "typecheck:ok"] });
    expect(shouldActivate(r, caps("tsconfig"), NO_TAGS)).toBe(false);
  });

  it("empty requires array -> gate passes (no tokens to fail)", () => {
    const r = rule({ requires: [] });
    expect(shouldActivate(r, NO_CAPS, NO_TAGS)).toBe(true);
  });
});

describe("shouldActivate — RULE-019 gate 3 / RULE-020 (disabledBy inverted gate)", () => {
  it("no disabledBy -> gate passes", () => {
    expect(shouldActivate(rule(), caps("strict"), NO_TAGS)).toBe(true);
  });

  it("disabledBy token ABSENT -> active (the inverse fires when flag is OFF)", () => {
    const r = rule({ disabledBy: ["strict"] });
    expect(shouldActivate(r, NO_CAPS, NO_TAGS)).toBe(true);
  });

  it("disabledBy token PRESENT -> false (self-disables once flag is ON)", () => {
    const r = rule({ disabledBy: ["strict"] });
    expect(shouldActivate(r, caps("strict"), NO_TAGS)).toBe(false);
  });

  it("ANY of several disabledBy present -> false (OR-gate)", () => {
    const r = rule({ disabledBy: ["useUnknownInCatchVariables", "strict"] });
    // dual gate (RULE-020): strict implies it.
    expect(shouldActivate(r, caps("strict"), NO_TAGS)).toBe(false);
  });

  it("none of several disabledBy present -> active", () => {
    const r = rule({ disabledBy: ["useUnknownInCatchVariables", "strict"] });
    expect(shouldActivate(r, NO_CAPS, NO_TAGS)).toBe(true);
  });
});

describe("shouldActivate — RULE-020 inverted CFG gating (enable-strict shape)", () => {
  // The canonical inverted pattern: requires:["tsconfig"] + disabledBy:["strict"].
  // Active IFF "strict" is ABSENT (flag OFF) while tsconfig is present.
  const enableStrict = rule({
    id: "enable-strict",
    tier: "CFG",
    requires: ["tsconfig"],
    disabledBy: ["strict"],
  });

  it("tsconfig present, strict ABSENT -> active (flag off -> recommend turning it on)", () => {
    expect(shouldActivate(enableStrict, caps("tsconfig"), NO_TAGS)).toBe(true);
  });

  it("tsconfig present, strict PRESENT -> false (flag already on -> rule disappears)", () => {
    expect(shouldActivate(enableStrict, caps("tsconfig", "strict"), NO_TAGS)).toBe(
      false,
    );
  });

  it("tsconfig ABSENT -> false (requires fails before disabledBy is even checked)", () => {
    // Even with strict absent (which would otherwise activate), requires gates it off.
    expect(shouldActivate(enableStrict, NO_CAPS, NO_TAGS)).toBe(false);
  });
});

describe("shouldActivate — RULE-019 gate 4 (ignored tags)", () => {
  it("no tags on rule -> gate passes", () => {
    expect(shouldActivate(rule(), NO_CAPS, tags("style"))).toBe(true);
  });

  it("rule tag NOT in ignoredTags -> active", () => {
    const r = rule({ tags: ["style"] });
    expect(shouldActivate(r, NO_CAPS, tags("correctness"))).toBe(true);
  });

  it("rule tag IN ignoredTags -> false", () => {
    const r = rule({ tags: ["style"] });
    expect(shouldActivate(r, NO_CAPS, tags("style"))).toBe(false);
  });

  it("ANY overlapping tag disables (one of several tags ignored)", () => {
    const r = rule({ tags: ["style", "pedantic"] });
    expect(shouldActivate(r, NO_CAPS, tags("pedantic"))).toBe(false);
  });

  it("empty ignoredTags -> never disabled by tags", () => {
    const r = rule({ tags: ["style"] });
    expect(shouldActivate(r, NO_CAPS, NO_TAGS)).toBe(true);
  });
});

describe("shouldActivate — RULE-019 gate 5 (opt-in: defaultEnabled false)", () => {
  it("defaultEnabled false + no explicit -> false (opt-in stays off)", () => {
    const r = rule({ defaultEnabled: false });
    expect(shouldActivate(r, NO_CAPS, NO_TAGS, undefined)).toBe(false);
  });

  it("defaultEnabled false + explicit severity -> active (override opts in)", () => {
    const r = rule({ defaultEnabled: false });
    expect(shouldActivate(r, NO_CAPS, NO_TAGS, "error")).toBe(true);
  });

  it("defaultEnabled true + no explicit -> active (default-on)", () => {
    const r = rule({ defaultEnabled: true });
    expect(shouldActivate(r, NO_CAPS, NO_TAGS)).toBe(true);
  });

  it("defaultEnabled undefined (omitted) + no explicit -> active (defaults on)", () => {
    // The KNOWN dead branch: no real rule sets defaultEnabled:false, so the catalog
    // is 100% default-on. The gate is preserved regardless.
    expect(shouldActivate(rule(), NO_CAPS, NO_TAGS)).toBe(true);
  });

  it("defaultEnabled false + explicit 'warning' (not 'off') -> active", () => {
    const r = rule({ defaultEnabled: false });
    expect(shouldActivate(r, NO_CAPS, NO_TAGS, "warning")).toBe(true);
  });
});

describe("shouldActivate — RULE-019 (no gates set -> default true)", () => {
  it("bare rule, empty caps/tags, no explicit -> active", () => {
    expect(shouldActivate(rule(), NO_CAPS, NO_TAGS)).toBe(true);
  });

  it("bare rule with explicit severity (not off) -> active", () => {
    expect(shouldActivate(rule(), NO_CAPS, NO_TAGS, "error")).toBe(true);
  });
});

describe("shouldActivate — RULE-019 ORDER between gates (combinations)", () => {
  it("disabledBy present beats requires-satisfied (gate 2 passes, gate 3 fails)", () => {
    const r = rule({ requires: ["tsconfig"], disabledBy: ["strict"] });
    // requires satisfied, but disabledBy also present -> false.
    expect(shouldActivate(r, caps("tsconfig", "strict"), NO_TAGS)).toBe(false);
  });

  it("requires-unsatisfied beats disabledBy-absent (gate 2 fails first)", () => {
    const r = rule({ requires: ["tsconfig"], disabledBy: ["strict"] });
    // disabledBy absent (would pass gate 3), but requires fails gate 2.
    expect(shouldActivate(r, NO_CAPS, NO_TAGS)).toBe(false);
  });

  it("ignored tag disables even when requires satisfied and disabledBy absent", () => {
    const r = rule({ requires: ["tsconfig"], disabledBy: ["strict"], tags: ["style"] });
    expect(shouldActivate(r, caps("tsconfig"), tags("style"))).toBe(false);
  });

  it("opt-in stays off even when requires satisfied + disabledBy absent + tags clear", () => {
    const r = rule({ requires: ["tsconfig"], defaultEnabled: false });
    expect(shouldActivate(r, caps("tsconfig"), NO_TAGS, undefined)).toBe(false);
  });

  it("explicit override revives an opt-in rule that also satisfies requires", () => {
    const r = rule({ requires: ["tsconfig"], defaultEnabled: false });
    expect(shouldActivate(r, caps("tsconfig"), NO_TAGS, "error")).toBe(true);
  });

  it("all gates satisfied simultaneously -> true", () => {
    const r = rule({
      requires: ["tsconfig", "typecheck:ok"],
      disabledBy: ["legacy"],
      tags: ["style"],
      defaultEnabled: true,
    });
    expect(
      shouldActivate(r, caps("tsconfig", "typecheck:ok"), tags("correctness"), "error"),
    ).toBe(true);
  });
});

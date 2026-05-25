/**
 * Characterization tests for `scoreLabel` — RULE-002 (score band label).
 *
 * RULE-002: score >= 75 -> "Great"; >= 50 -> "Needs work"; else -> "Critical".
 * Both lower bounds are INCLUSIVE.
 *
 * RULE-041: the band cutoffs 75/50 are FROZEN constants in code, never config.
 *
 * NOTE: the modern band type is `ScoreBand = "Great" | "Needs work" | "Critical"`
 * (a literal union), unlike legacy's plain `string`. The string values are
 * preserved verbatim.
 *
 * `scoreLabel` takes a branded `Score` (not a raw `number`), so its `[0,100]`
 * precondition is enforced at the type level; inputs are built via `makeScore`.
 */

import { describe, expect, it } from "vitest";
import { SCORE_GOOD, SCORE_OK, makeScore, scoreLabel } from "../main/index.js";

describe("scoreLabel — RULE-041 (frozen band cutoffs)", () => {
  it("freezes SCORE_GOOD = 75", () => {
    expect(SCORE_GOOD).toBe(75);
  });
  it("freezes SCORE_OK = 50", () => {
    expect(SCORE_OK).toBe(50);
  });
});

describe("scoreLabel — RULE-002 (Great band, >= 75 inclusive)", () => {
  it("100 -> Great", () => {
    expect(scoreLabel(makeScore(100))).toBe("Great");
  });
  it("75 -> Great (lower bound inclusive)", () => {
    expect(scoreLabel(makeScore(75))).toBe("Great");
  });
  it("76 -> Great (just above the boundary)", () => {
    expect(scoreLabel(makeScore(76))).toBe("Great");
  });
});

describe("scoreLabel — RULE-002 (Needs work band, 50..74)", () => {
  it("74 -> Needs work (just below Great)", () => {
    expect(scoreLabel(makeScore(74))).toBe("Needs work");
  });
  it("50 -> Needs work (lower bound inclusive)", () => {
    expect(scoreLabel(makeScore(50))).toBe("Needs work");
  });
});

describe("scoreLabel — RULE-002 (Critical band, < 50)", () => {
  it("49 -> Critical (just below Needs work)", () => {
    expect(scoreLabel(makeScore(49))).toBe("Critical");
  });
  it("0 -> Critical", () => {
    expect(scoreLabel(makeScore(0))).toBe("Critical");
  });
});

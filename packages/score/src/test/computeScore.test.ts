/**
 * Characterization tests for `computeScore` — RULE-001 (project health score).
 *
 * These tests DEFINE "done" for the Effect-TS rewrite: the implementation in
 * `../main/index.js` is written AFTER these tests and must make them pass.
 *
 * CRITICAL DEVIATION FROM LEGACY (human-approved, RULE-001 flagged defect):
 *   Legacy `score.ts:67` uses `Math.round` (round-half-UP toward +infinity).
 *   The modern module DELIBERATELY pins round-half-to-EVEN (banker's rounding).
 *   At exact halves the modern outputs therefore differ from legacy. These
 *   tests encode the HALF-EVEN expectations on purpose; they intentionally
 *   contradict `legacy/.../score.test.ts`. The differential equivalence proof
 *   lives in `equivalence.test.ts`.
 *
 * Penalty is always a multiple of 0.25 (= 0.25*(6e+3w)), so
 *   raw = 100 - penalty
 * lands on N.5 only when 2e + w === 2 (mod 4). At N.5: half-even -> N if N even,
 * N+1 if N odd. Legacy half-up always -> N+1. Hence modern = legacy - 1 exactly
 * when raw = N.5 with N even; otherwise modern = legacy.
 */

import { describe, expect, it } from "vitest";
import {
  ERROR_RULE_PENALTY,
  PERFECT_SCORE,
  WARNING_RULE_PENALTY,
  computeScore,
} from "../main/index.js";
import type { Diagnostic } from "../main/index.js";

/**
 * Build a plain Diagnostic literal (structural typing — no runtime sibling import).
 * Mirrors the legacy test's `diag()` helper. Only `plugin`/`rule`/`severity`
 * matter for scoring; the other fields are filler so the projection is realistic.
 */
function diag(
  over: Partial<Diagnostic> & Pick<Diagnostic, "rule" | "severity">,
): Diagnostic {
  return {
    plugin: "tsnuke",
    ...over,
  } as Diagnostic;
}

describe("computeScore — RULE-001 (frozen constants)", () => {
  // RULE-041: weights are FROZEN in code, never config.
  it("freezes ERROR_RULE_PENALTY = 1.5", () => {
    expect(ERROR_RULE_PENALTY).toBe(1.5);
  });
  it("freezes WARNING_RULE_PENALTY = 0.75", () => {
    expect(WARNING_RULE_PENALTY).toBe(0.75);
  });
  it("freezes PERFECT_SCORE = 100", () => {
    expect(PERFECT_SCORE).toBe(100);
  });
});

describe("computeScore — RULE-001 (empty short-circuit)", () => {
  it("empty diagnostics -> score 100, band Great", () => {
    const result = computeScore([]);
    expect(result.score).toBe(100);
    expect(result.score).toBe(PERFECT_SCORE);
    expect(result.band).toBe("Great");
  });
});

describe("computeScore — RULE-001 (half-even rounding deviation)", () => {
  // 1 distinct error rule -> penalty 1.5 -> raw 98.5 -> N=98 even
  // half-even -> 98 (legacy half-up was 99). This contradicts legacy ON PURPOSE.
  it("1 distinct error rule -> raw 98.5 -> 98 (half-even; legacy was 99)", () => {
    const result = computeScore([diag({ rule: "no-any", severity: "error" })]);
    expect(result.score).toBe(98);
    expect(result.band).toBe("Great");
  });

  // 6 distinct warning rules -> penalty 4.5 -> raw 95.5 -> N=95 odd
  // half-even -> 96 (same as legacy half-up). Non-divergent half, for contrast.
  it("6 distinct warning rules -> raw 95.5 -> 96 (half-even; matches legacy)", () => {
    const ds = Array.from({ length: 6 }, (_, i) =>
      diag({ rule: `warn-${i}`, severity: "warning" }),
    );
    expect(computeScore(ds).score).toBe(96);
  });

  // 2 error + 1 warning -> penalty 3.75 -> raw 96.25 -> not a half -> 96 (matches legacy).
  it("2 error + 1 warning rules -> raw 96.25 -> 96 (no half; matches legacy)", () => {
    const ds = [
      diag({ rule: "no-any", severity: "error" }),
      diag({ rule: "no-floating-promise", severity: "error" }),
      diag({ rule: "prefer-type-alias", severity: "warning" }),
    ];
    expect(computeScore(ds).score).toBe(96);
  });
});

describe("computeScore — RULE-001 (breadth-not-depth distinctness)", () => {
  // Same rule firing N times in one file counts ONCE.
  it("same rule firing 3x -> still 1 distinct error rule -> 98", () => {
    const ds = [
      diag({ rule: "no-any", severity: "error", line: 1 }),
      diag({ rule: "no-any", severity: "error", line: 5 }),
      diag({ rule: "no-any", severity: "error", line: 9 }),
    ];
    expect(computeScore(ds).score).toBe(98);
  });

  // Same rule key across two different files counts ONCE.
  it("same error rule across two files -> 1 distinct -> 98", () => {
    const ds = [
      diag({ rule: "no-any", severity: "error", filePath: "/x/a.ts" }),
      diag({ rule: "no-any", severity: "error", filePath: "/x/b.ts" }),
    ];
    expect(computeScore(ds).score).toBe(98);
  });

  // Distinctness is on `plugin/rule`, so same rule id under a different plugin
  // is a DISTINCT key (2 distinct error rules -> penalty 3 -> raw 97 -> 97).
  it("same rule id under different plugins -> 2 distinct keys -> 97", () => {
    const ds = [
      diag({ plugin: "tsnuke", rule: "no-any", severity: "error" }),
      diag({ plugin: "other", rule: "no-any", severity: "error" }),
    ];
    expect(computeScore(ds).score).toBe(97);
  });
});

describe("computeScore — RULE-001 (binary severity split)", () => {
  // severity === "error" -> error bucket; anything else -> warning bucket.
  it("'error' goes to the error bucket (penalty 1.5)", () => {
    expect(computeScore([diag({ rule: "r", severity: "error" })]).score).toBe(
      98,
    );
  });

  it("'warning' goes to the warning bucket (penalty 0.75 -> raw 99.25 -> 99)", () => {
    expect(computeScore([diag({ rule: "r", severity: "warning" })]).score).toBe(
      99,
    );
  });

  it("mixed errors and warnings sum both buckets (1 err + 1 warn -> penalty 2.25 -> 98)", () => {
    const ds = [
      diag({ rule: "e", severity: "error" }),
      diag({ rule: "w", severity: "warning" }),
    ];
    // raw = 100 - 2.25 = 97.75 -> 98
    expect(computeScore(ds).score).toBe(98);
  });
});

describe("computeScore — RULE-001 (floor at 0)", () => {
  it("200 distinct error rules -> floored at 0, band Critical", () => {
    const ds = Array.from({ length: 200 }, (_, i) =>
      diag({ rule: `rule-${i}`, severity: "error" }),
    );
    const result = computeScore(ds);
    expect(result.score).toBe(0);
    expect(result.band).toBe("Critical");
  });

  it("exactly enough error rules to hit 0 stays at 0, never negative", () => {
    // 67 distinct error rules -> penalty 100.5 -> raw -0.5 -> floored to 0.
    const ds = Array.from({ length: 67 }, (_, i) =>
      diag({ rule: `rule-${i}`, severity: "error" }),
    );
    expect(computeScore(ds).score).toBe(0);
  });
});

describe("computeScore — RULE-001/002 (result shape)", () => {
  it("returns { score, band } with band derived from the score", () => {
    const result = computeScore([diag({ rule: "r", severity: "error" })]);
    expect(result).toStrictEqual({ score: 98, band: "Great" });
  });
});

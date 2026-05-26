/**
 * THE EQUIVALENCE PROOF — differential test, modern vs legacy oracle (RULE-001).
 *
 * Goal: prove the Effect-TS `computeScore` is byte-for-byte equivalent to the
 * legacy algorithm EVERYWHERE EXCEPT at exact halves, where the modern module
 * deliberately rounds half-to-EVEN instead of legacy's half-UP (`Math.round`).
 * That single, human-approved deviation (RULE-001's flagged suspected defect)
 * is itself pinned precisely: modern = legacy - 1 exactly when raw = N + 0.5
 * with N even; modern = legacy otherwise.
 *
 * Strategy:
 *   1. Vendored frozen copy of the legacy algorithm as an oracle (below).
 *   2. An INDEPENDENT half-even reference (`roundHalfEven`) computed in-test, so
 *      we're not merely re-deriving the implementation — we assert against two
 *      separately-authored references.
 *   3. EXHAUSTIVE enumeration of distinct-error-rule count e in [0,80] and
 *      distinct-warning-rule count w in [0,160]: 81 * 161 = 13041 pairs. For each
 *      pair we build that many distinct-keyed diagnostics, run the modern fn, and
 *      assert both relationships. This covers every residue class of (6e+3w) mod 4
 *      (so every half-case and non-half-case), and the floor-at-0 region.
 */

import { describe, expect, it } from "vitest";
import {
  ERROR_RULE_PENALTY,
  PERFECT_SCORE,
  WARNING_RULE_PENALTY,
  computeScore,
} from "../main/index.js";
import type { Diagnostic } from "../main/index.js";

// ---------------------------------------------------------------------------
// ORACLE: Frozen copy of legacy/tsnuke/packages/core/src/score.ts:49-69
// (half-UP via Math.round). For differential testing ONLY — do not "fix" it.
// ---------------------------------------------------------------------------
const LEGACY_ERROR_RULE_PENALTY = 1.5;
const LEGACY_WARNING_RULE_PENALTY = 0.75;
const LEGACY_PERFECT_SCORE = 100;

function legacyRuleKey(d: { plugin: string; rule: string }): string {
  return `${d.plugin}/${d.rule}`;
}

function legacyComputeScore(
  diagnostics: readonly Diagnostic[],
): { score: number } {
  if (diagnostics.length === 0) {
    return { score: LEGACY_PERFECT_SCORE };
  }
  const errorRules = new Set<string>();
  const warningRules = new Set<string>();
  for (const d of diagnostics) {
    if (d.severity === "error") errorRules.add(legacyRuleKey(d));
    else warningRules.add(legacyRuleKey(d));
  }
  const penalty =
    errorRules.size * LEGACY_ERROR_RULE_PENALTY +
    warningRules.size * LEGACY_WARNING_RULE_PENALTY;
  // Math.round = round-half-UP toward +infinity (the deviation point).
  const score = Math.max(0, Math.round(LEGACY_PERFECT_SCORE - penalty));
  return { score };
}

// ---------------------------------------------------------------------------
// INDEPENDENT REFERENCE: round-half-to-even (banker's rounding). Authored here
// from first principles so the assertion is not circular with the impl.
// ---------------------------------------------------------------------------
function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  // exactly .5 -> round toward the even neighbour
  return floor % 2 === 0 ? floor : floor + 1;
}

// ---------------------------------------------------------------------------
// Test-data builder: produce `e` distinct error-rule keys and `w` distinct
// warning-rule keys (each fires once). Distinct keys exercise the Set-based
// breadth-not-depth counting that drives the penalty.
// ---------------------------------------------------------------------------
const baseDiag: Omit<Diagnostic, "rule" | "severity"> = {
  plugin: "tsnuke",
  filePath: "/x.ts",
  message: "m",
  help: "h",
  line: 1,
  column: 1,
  category: "c",
  tier: "SYN",
};

function buildDiagnostics(e: number, w: number): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (let i = 0; i < e; i++) {
    out.push({ ...baseDiag, rule: `err-${i}`, severity: "error" });
  }
  for (let i = 0; i < w; i++) {
    out.push({ ...baseDiag, rule: `warn-${i}`, severity: "warning" });
  }
  return out;
}

const E_MAX = 80;
const W_MAX = 160;

describe("equivalence — RULE-001 sanity: oracle + reference agree on the deviation", () => {
  it("modern constants match the frozen oracle constants", () => {
    expect(ERROR_RULE_PENALTY).toBe(LEGACY_ERROR_RULE_PENALTY);
    expect(WARNING_RULE_PENALTY).toBe(LEGACY_WARNING_RULE_PENALTY);
    expect(PERFECT_SCORE).toBe(LEGACY_PERFECT_SCORE);
  });

  it("roundHalfEven differs from Math.round (half-up) exactly at even-N halves", () => {
    // 98.5 -> even N=98 -> half-even 98 vs half-up 99 (the divergence)
    expect(roundHalfEven(98.5)).toBe(98);
    expect(Math.round(98.5)).toBe(99);
    // 95.5 -> odd N=95 -> half-even 96 == half-up 96 (no divergence)
    expect(roundHalfEven(95.5)).toBe(96);
    expect(Math.round(95.5)).toBe(96);
    // non-half always agrees
    expect(roundHalfEven(96.25)).toBe(96);
    expect(Math.round(96.25)).toBe(96);
  });
});

describe("equivalence — RULE-001 exhaustive differential (e in [0,80] x w in [0,160])", () => {
  it("modern == legacy except at even-N halves, where modern == legacy - 1", () => {
    let comparedPairs = 0;
    let divergedPairs = 0;

    for (let e = 0; e <= E_MAX; e++) {
      for (let w = 0; w <= W_MAX; w++) {
        const diagnostics = buildDiagnostics(e, w);
        const modern = computeScore(diagnostics).score;
        const legacy = legacyComputeScore(diagnostics).score;

        const penalty = e * ERROR_RULE_PENALTY + w * WARNING_RULE_PENALTY;
        const raw = PERFECT_SCORE - penalty;

        // (A) Independent half-even reference (with the same floor-at-0 clamp).
        const reference = roundHalfEven(Math.max(0, raw));
        expect(
          modern,
          `half-even reference mismatch at e=${e} w=${w} raw=${raw}`,
        ).toBe(reference);

        // (B) Relationship to the legacy oracle.
        const clamped = Math.max(0, raw);
        const N = Math.floor(clamped);
        const isHalf = Math.abs(clamped - N - 0.5) < 1e-9;
        // Divergence only in the non-floored region: a negative or zero raw
        // clamps both impls to 0, so no half-induced difference can show there.
        const divergesByPolicy = isHalf && N % 2 === 0 && raw > 0;

        if (divergesByPolicy) {
          divergedPairs++;
          expect(
            modern,
            `expected modern = legacy - 1 at e=${e} w=${w} raw=${raw} (legacy=${legacy})`,
          ).toBe(legacy - 1);
        } else {
          expect(
            modern,
            `expected modern == legacy at e=${e} w=${w} raw=${raw} (legacy=${legacy})`,
          ).toBe(legacy);
        }

        comparedPairs++;
      }
    }

    // Guard the harness itself: the full grid was traversed and the deviation
    // actually fired (otherwise an all-equal pass would prove nothing).
    expect(comparedPairs).toBe((E_MAX + 1) * (W_MAX + 1));
    expect(comparedPairs).toBe(13041);
    expect(divergedPairs).toBeGreaterThan(0);
  });
});

describe("equivalence — RULE-001 distinctness/breadth under repetition", () => {
  // Differential proof that occurrence count never affects the score: repeating
  // each distinct rule a random number of times must yield the SAME score as
  // firing each once (modern), and that score must follow the pinned policy
  // relative to the legacy oracle (computed on the de-duplicated single-fire set).
  it("repeating distinct rules N times each does not change the modern score", () => {
    let seed = 0x9e3779b9;
    const rand = () => {
      // deterministic xorshift so the test is reproducible (RULE-041 spirit)
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) % 5) + 1; // 1..5 repetitions
    };

    for (let trial = 0; trial < 50; trial++) {
      const e = (trial * 7) % 13; // 0..12 distinct error rules
      const w = (trial * 11) % 17; // 0..16 distinct warning rules

      const singleFire = buildDiagnostics(e, w);
      const repeated: Diagnostic[] = [];
      for (const d of singleFire) {
        const times = rand();
        for (let k = 0; k < times; k++) {
          // same plugin/rule/severity -> same key -> de-duplicated
          repeated.push({ ...d, line: k + 1 });
        }
      }

      const scoreSingle = computeScore(singleFire).score;
      const scoreRepeated = computeScore(repeated).score;
      expect(
        scoreRepeated,
        `breadth-not-depth violated at e=${e} w=${w}`,
      ).toBe(scoreSingle);

      // and the de-duplicated score still tracks the legacy oracle (run on the
      // single-fire set, which is what legacy would also de-dup to).
      const legacy = legacyComputeScore(singleFire).score;
      const penalty = e * ERROR_RULE_PENALTY + w * WARNING_RULE_PENALTY;
      const raw = PERFECT_SCORE - penalty;
      const N = Math.floor(Math.max(0, raw));
      const isHalf = Math.abs(Math.max(0, raw) - N - 0.5) < 1e-9;
      const expected = isHalf && N % 2 === 0 && raw > 0 ? legacy - 1 : legacy;
      expect(scoreSingle).toBe(expected);
    }
  });
});

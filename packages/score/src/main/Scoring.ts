/**
 * Local, deterministic health scoring — the pure core (RULE-001, RULE-002, RULE-003).
 *
 * Computed in-process from the diagnostic set: no network, no clock, no randomness
 * (RULE-041). Same inputs → identical score. This determinism is the property an
 * agent loop (`while score < target: fix && rescan`) depends on. Per the
 * Modernization Brief (line 91) these stay **plain synchronous pure functions** —
 * NOT `Effect`-wrapped; the Effect ecosystem appears only in the contract/types
 * (Schema, branded `Score`, `Option`).
 *
 * Policy (frozen, see {@link ./Score.ts}):
 *  - Penalize DISTINCT `plugin/rule` keys, not occurrences — breadth, not depth
 *    (RULE-001). A rule firing 3× in a file is penalized once.
 *  - score = clampToZero(roundHalfEven(100 − (errors×1.5 + warnings×0.75)))
 *  - bands: ≥75 "Great" / ≥50 "Needs work" / else "Critical" (RULE-002).
 *
 * ROUNDING (deliberate, human-approved deviation from legacy): legacy `score.ts`
 * used `Math.round` (round-half-UP). This module pins **round-half-to-EVEN**
 * (RULE-001's flagged suspected defect). They differ only at exact-half raw scores
 * — see TRANSFORMATION_NOTES.md. Penalties are exact multiples of 0.25, all
 * binary-representable, so the `=== 0.5` test below is exact (no float slop).
 */

import { Array as Arr, Option } from "effect";
import type { Diagnostic } from "@ts-doctor/contracts-effect";
import {
  ERROR_RULE_PENALTY,
  PERFECT_SCORE,
  SCORE_GOOD,
  SCORE_OK,
  WARNING_RULE_PENALTY,
  type Score,
  type ScoreBand,
  type ScoreResult,
} from "./Score.js";

/**
 * Round half-to-even (banker's rounding). Domain-restricted: only correct for the
 * non-negative raw scores this module produces (`100 − penalty`, then clamped at 0).
 * It floors, so it is NOT a symmetric general-purpose rounder for negative inputs —
 * do not borrow it for signed deltas in another slice. See the rounding note above.
 */
function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1; // exactly .5 → toward the even neighbour
}

/** The `plugin/rule` identity used for distinct-rule counting (NOT positional). */
const ruleKey = (d: Pick<Diagnostic, "plugin" | "rule">): string => `${d.plugin}/${d.rule}`;

/**
 * Brand a number already proven to be an integer in `[0, 100]`. The scoring math
 * guarantees this (floor-at-0 + round + penalty ≥ 0 ⇒ ≤ 100), so we skip the
 * `Schema.decodeSync` validation on the hot path. Use {@link makeScore} at trust
 * boundaries where the range is not guaranteed.
 */
const unsafeScore = (n: number): Score => n as Score;

/** Internal band projection over a raw number (RULE-002, lower-bound inclusive). */
const bandOf = (score: number): ScoreBand => {
  if (score >= SCORE_GOOD) return "Great";
  if (score >= SCORE_OK) return "Needs work";
  return "Critical";
};

/**
 * Map a validated {@link Score} to its band label (RULE-002). The public seam takes
 * a branded `Score`, so the `[0, 100]` precondition is enforced at the type level —
 * a bare `number` parameter would let `scoreLabel(150)` silently return "Great".
 * Internal callers that hold a raw, provably-in-range int use {@link bandOf}.
 */
export const scoreLabel = (score: Score): ScoreBand => bandOf(score);

/**
 * Compute the local health score and its band (RULE-001 + RULE-002).
 *
 * Counts DISTINCT `plugin/rule` keys per severity (breadth-not-depth, RULE-001),
 * applies the frozen weights, rounds half-to-even, and floors at 0. Empty → 100.
 *
 * Severity is bucketed STRUCTURALLY (`=== "error"`, else warning); `computeScore`
 * does NOT `Schema.decode` its input (kept pure & fast, per the brief's
 * architecture-critic caveat), so an out-of-contract severity is treated as a
 * warning rather than rejected — matching legacy. Decode at the trust boundary
 * first if rejection is required.
 */
export const computeScore = (diagnostics: ReadonlyArray<Diagnostic>): ScoreResult => {
  if (diagnostics.length === 0) {
    return { score: unsafeScore(PERFECT_SCORE), band: bandOf(PERFECT_SCORE) };
  }

  const errorRules = new Set<string>();
  const warningRules = new Set<string>();
  for (const d of diagnostics) {
    if (d.severity === "error") errorRules.add(ruleKey(d));
    else warningRules.add(ruleKey(d));
  }

  const penalty =
    errorRules.size * ERROR_RULE_PENALTY + warningRules.size * WARNING_RULE_PENALTY;
  const score = Math.max(0, roundHalfToEven(PERFECT_SCORE - penalty));

  return { score: unsafeScore(score), band: bandOf(score) };
};

/**
 * Monorepo summary score = MIN over scored projects — the worst package represents
 * the whole (RULE-003). Unscored projects are `Option.none` and skipped; if nothing
 * is scored the summary is `Option.none`. (Idiomatic replacement for legacy's
 * `number | null`; bridge a nullable score with `Option.fromNullable`.)
 */
export const summarizeMonorepoScore = (
  scores: ReadonlyArray<Option.Option<Score>>,
): Option.Option<Score> => {
  const present = Arr.getSomes(scores);
  return Arr.isNonEmptyReadonlyArray(present)
    ? Option.some(present.reduce((min, s) => (s < min ? s : min)))
    : Option.none();
};

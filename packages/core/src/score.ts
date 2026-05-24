/**
 * LOCAL, deterministic health scoring (BC-01, BC-02, BC-03, BC-04, BC-05).
 *
 * The score is computed in-process from the diagnostic set — no network, no
 * clock, no randomness. Same inputs → identical score. This determinism is the
 * property an agent loop (`while score < target: fix && rescan`) depends on.
 *
 * Policy (§5, frozen):
 *  - Penalize **distinct** `plugin/rule` keys, not occurrences — breadth, not
 *    depth (BC-02). A rule firing 3× in a file is penalized once.
 *  - Two FROZEN weights (in code, NOT config — config-tunable weights would make
 *    two machines compute different scores for identical code, destroying the
 *    cross-machine comparability the score exists for): error 1.5 / warning 0.75.
 *  - Empty diagnostics → 100. Floor at 0. Round to integer.
 *
 *      score = max(0, round(100 − (distinctErrorRules×1.5 + distinctWarningRules×0.75)))
 *      bands: ≥75 "Great" / ≥50 "Needs work" / else "Critical"
 */

import type { Diagnostic } from "@ts-doctor/rules";

/** FROZEN penalty per distinct error-severity rule. Not user-configurable (§5). */
export const ERROR_RULE_PENALTY = 1.5;
/** FROZEN penalty per distinct warning-severity rule. Not user-configurable (§5). */
export const WARNING_RULE_PENALTY = 0.75;
/** The score of a project with zero diagnostics. */
export const PERFECT_SCORE = 100;

/** Lower-bound (inclusive) for the "Great" band. */
export const SCORE_GOOD = 75;
/** Lower-bound (inclusive) for the "Needs work" band. */
export const SCORE_OK = 50;

const LABEL_GREAT = "Great";
const LABEL_NEEDS_WORK = "Needs work";
const LABEL_CRITICAL = "Critical";

/** The `plugin/rule` identity used for distinct-rule counting (NOT positional). */
function ruleKey(d: Pick<Diagnostic, "plugin" | "rule">): string {
  return `${d.plugin}/${d.rule}`;
}

/**
 * Compute the local health score and its band label (BC-01, BC-02, BC-04).
 *
 * Counts DISTINCT `plugin/rule` keys per severity (breadth-not-depth, BC-02),
 * applies the frozen weights, floors at 0, and rounds. Empty → 100.
 */
export function computeScore(
  diagnostics: readonly Diagnostic[],
): { score: number; label: string } {
  if (diagnostics.length === 0) {
    return { score: PERFECT_SCORE, label: scoreLabel(PERFECT_SCORE) };
  }

  const errorRules = new Set<string>();
  const warningRules = new Set<string>();
  for (const d of diagnostics) {
    if (d.severity === "error") errorRules.add(ruleKey(d));
    else warningRules.add(ruleKey(d));
  }

  const penalty =
    errorRules.size * ERROR_RULE_PENALTY +
    warningRules.size * WARNING_RULE_PENALTY;

  const score = Math.max(0, Math.round(PERFECT_SCORE - penalty));
  return { score, label: scoreLabel(score) };
}

/** Map a numeric score to its band label (BC-04, lower-bound inclusive). */
export function scoreLabel(score: number): string {
  if (score >= SCORE_GOOD) return LABEL_GREAT;
  if (score >= SCORE_OK) return LABEL_NEEDS_WORK;
  return LABEL_CRITICAL;
}

/**
 * Monorepo summary score = MIN over scored projects (worst represents the whole;
 * BC-05). `null` entries (unscored projects) are skipped. If nothing is scored,
 * the summary score is `null`.
 */
export function summarizeMonorepoScore(
  perProjectScores: readonly (number | null)[],
): number | null {
  let min: number | null = null;
  for (const s of perProjectScores) {
    if (s === null) continue;
    min = min === null ? s : Math.min(min, s);
  }
  return min;
}

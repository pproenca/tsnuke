/**
 * `@tsnuke/score-effect` — public surface of the Effect-TS scoring slice.
 *
 * Implements RULE-001 (health score), RULE-002 (band label), RULE-003 (monorepo
 * MIN summary) and RULE-041 (frozen-determinism policy). See TRANSFORMATION_NOTES.md
 * for the legacy → target mapping and the deliberate half-even rounding deviation.
 */

// The input contract scoring genuinely takes — DE-VENDORED to `@tsnuke/contracts-effect`
// (the canonical `Diagnostic`/`Severity` Schemas; the local `Diagnostic.ts` was deleted).
// The barrel keeps re-exporting ONLY `Diagnostic` + `Severity` (its established narrow
// public surface); contracts' `Fix`/`TextEdit`/`Tier`/`FixKind` are intentionally NOT
// re-exported here, preserving this slice's contract.
export { Diagnostic, Severity } from "@tsnuke/contracts-effect";

export {
  ERROR_RULE_PENALTY,
  WARNING_RULE_PENALTY,
  PERFECT_SCORE,
  SCORE_GOOD,
  SCORE_OK,
  Score,
  ScoreBand,
  makeScore,
  decodeScore,
  type ScoreResult,
} from "./Score.js";

export { computeScore, scoreLabel, summarizeMonorepoScore } from "./Scoring.js";

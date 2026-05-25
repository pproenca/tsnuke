/**
 * Frozen scoring policy + domain types (RULE-001, RULE-002, RULE-041).
 *
 * The weights and band cutoffs are FROZEN in code, never config (RULE-041): two
 * machines must compute identical scores for identical code. The score is modeled
 * as a branded `Schema.Int` constrained to `[0, 100]`, which lifts RULE-001's
 * floor-at-0 / round-to-int postcondition and RULE-002's "caller guarantees ≤ 100"
 * precondition into the type system.
 */

import { Option, Schema } from "effect";

/** FROZEN penalty per distinct error-severity rule. Not user-configurable (RULE-041). */
export const ERROR_RULE_PENALTY = 1.5;
/** FROZEN penalty per distinct warning-severity rule. Not user-configurable (RULE-041). */
export const WARNING_RULE_PENALTY = 0.75;
/** The score of a project with zero diagnostics. FROZEN (RULE-041). */
export const PERFECT_SCORE = 100;

/** Lower-bound (inclusive) for the "Great" band. FROZEN (RULE-041). */
export const SCORE_GOOD = 75;
/** Lower-bound (inclusive) for the "Needs work" band. FROZEN (RULE-041). */
export const SCORE_OK = 50;

/**
 * A project health score: an integer in `[0, 100]` (RULE-001). Branded so a raw
 * `number` can't be passed where a validated score is expected.
 */
export const Score = Schema.Int.pipe(Schema.between(0, 100), Schema.brand("Score"));
export type Score = typeof Score.Type;

/**
 * Construct a {@link Score} from a TRUSTED, known-good number (test fixtures,
 * literals, values already proven in range). Validates integer ∈ `[0, 100]` and
 * THROWS `ParseError` on violation — so a bad value is a loud programmer error.
 * For untrusted/external input, use {@link decodeScore} instead. The scoring math
 * does not route through this — it produces values already provably in range.
 */
export const makeScore: (n: number) => Score = Schema.decodeSync(Score);

/**
 * Decode a {@link Score} from untrusted input, returning `Option.none` (not an
 * exception) when it isn't an integer in `[0, 100]`. This is the trust-boundary
 * constructor — e.g. bridging a legacy `number | null` per-project score into
 * {@link summarizeMonorepoScore}: `Option.fromNullable(n).pipe(Option.flatMap(decodeScore))`.
 */
export const decodeScore: (u: unknown) => Option.Option<Score> =
  Schema.decodeUnknownOption(Score);

/**
 * Band label (RULE-002). A literal union (modern) replaces legacy's bare `string`;
 * the three label strings are preserved verbatim for wire compatibility.
 */
export const ScoreBand = Schema.Literal("Great", "Needs work", "Critical");
export type ScoreBand = typeof ScoreBand.Type;

/**
 * The result of scoring a diagnostic set (RULE-001 + RULE-002): the integer score
 * and its band. A plain readonly record (no Effect wrapper) — the field is `band`
 * (typed {@link ScoreBand}), renamed from legacy's `label: string`.
 */
export interface ScoreResult {
  readonly score: Score;
  readonly band: ScoreBand;
}

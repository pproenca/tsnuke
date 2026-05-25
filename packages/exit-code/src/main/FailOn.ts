/**
 * The exit-code gate's contract types (RULE-030, RULE-031), as `effect/Schema`
 * literals — the wire/domain vocabulary, not hand-rolled string unions (per the
 * Modernization Brief: model `FailOn`/`Severity` as Schema literals where it adds
 * value, so untrusted CLI/config input has a single runtime decode gate).
 *
 * Mirrors `legacy/tsnuke/packages/tsnuke/src/flags.ts:14` (`FailOn`) and
 * `packages/tsnuke-rules/src/types.ts:13` (`Severity`). The literal *values*
 * are preserved verbatim, so this is value- and wire-compatible with legacy.
 *
 * The gate/resolver functions in `./resolve.ts` accept already-typed values and do
 * NOT decode on the hot path (kept pure & synchronous, per the brief's
 * architecture-critic caveat); callers decode at the trust boundary if needed.
 */

import { Schema } from "effect";

/**
 * The `--fail-on` gate mode (RULE-030):
 *   - `"error"`   → fail only if an `error`-severity diagnostic exists (the default)
 *   - `"warning"` → fail if there is ANY diagnostic
 *   - `"none"`    → never fail
 * Default is `"error"` (legacy `flags.ts`); see {@link DEFAULT_FAIL_ON}.
 */
export const FailOn = Schema.Literal("error", "warning", "none").annotations({
  identifier: "FailOn",
});
export type FailOn = typeof FailOn.Type;

/**
 * The default gate mode when `--fail-on` is not supplied — `"error"` (RULE-030,
 * legacy `flags.ts` default). Exported so the CLI/config layer derives its default
 * from the contract rather than re-stating the string.
 */
export const DEFAULT_FAIL_ON: FailOn = "error";

/**
 * Decode a {@link FailOn} from untrusted input (a CLI flag or config field),
 * returning `Option.none` when it isn't one of the three literals — the
 * trust-boundary constructor. The gate functions themselves do not call this.
 */
export const decodeFailOn = Schema.decodeUnknownOption(FailOn);

/**
 * Diagnostic severity — tsnuke v1 has `error` and `warning` only, deliberately
 * no `info` level (RULE-031). Severity is the only field the exit-code gate reads
 * from a diagnostic.
 */
export const Severity = Schema.Literal("error", "warning").annotations({
  identifier: "Severity",
});
export type Severity = typeof Severity.Type;

/**
 * The exit-code gate — the pure logic core (RULE-030).
 *
 * Computed in-process from a completed run: no `process.exit` here, no clock, no
 * randomness. These compute the *intended* exit code; the CLI edge sets
 * `process.exitCode = …` so the logic stays unit-testable (carried verbatim from
 * the legacy header, `exit-code.ts:9-12`). SIGINT→130 and EPIPE→0 are handled at
 * the process edge, NOT here.
 *
 * Per the Modernization Brief (line 25/91) these stay **plain synchronous pure
 * functions** — NOT `Effect<...>`-wrapped: a boolean/literal gate decision buys
 * nothing from a fiber and the architecture-critic caveat warns against
 * over-applying Effect. The Effect ecosystem appears only in the contract/types
 * (`FailOn`/`Severity`/`ExitCode` Schemas) and in `Match` for the dispatch below.
 *
 * Gate semantics (RULE-030):
 *   - `none`    → false (never fails)
 *   - `warning` → true iff there is ANY diagnostic
 *   - `error`   → true iff some diagnostic has `severity === "error"`
 *
 * Resolver precedence (RULE-030, order is load-bearing):
 *   1. `hadError === true` → 1 (the run itself threw)
 *   2. else `scoreMode`    → 0 (the score never gates, even with errors)
 *   3. else the gate       → 1 if tripped, else 0
 */

import { Match } from "effect";
import { FAIL, PASS, type ExitCode } from "./ExitCode.js";
import type { FailOn, Severity } from "./FailOn.js";

/** The minimal diagnostic the gate reads — only `severity` matters (RULE-030). */
type SeverityOnly = { readonly severity: Severity };

/**
 * Decide whether a diagnostic set trips the `--fail-on` gate (RULE-030).
 *
 * Dispatched with `effect/Match` over the `FailOn` literal. `Match.exhaustive`
 * makes the three-arm cover a compile-time *and* runtime totality guard — the
 * idiomatic replacement for legacy's `default: const _never: never = failOn`
 * exhaustiveness check (`exit-code.ts:29-33`): adding a fourth `FailOn` literal
 * without an arm here is a type error.
 *
 * The input needs only `Pick<Diagnostic, "severity">` per element. Severity is
 * compared structurally (`=== "error"`); the gate does not `Schema.decode` its
 * input on the hot path (kept pure & fast, per the brief's architecture-critic
 * caveat) — matching legacy, which also reads the field directly.
 */
export const shouldFailForDiagnostics = (
  diagnostics: ReadonlyArray<SeverityOnly>,
  failOn: FailOn,
): boolean =>
  Match.value(failOn).pipe(
    Match.when("none", () => false),
    Match.when("warning", () => diagnostics.length > 0),
    Match.when("error", () => diagnostics.some((d) => d.severity === "error")),
    Match.exhaustive,
  );

/** Inputs the exit-code resolver needs from a completed run (RULE-030). */
export interface ExitCodeInputs {
  readonly diagnostics: ReadonlyArray<SeverityOnly>;
  readonly failOn: FailOn;
  /** `--score` mode never gates — the score is informational, not a gate (RULE-030). */
  readonly scoreMode: boolean;
  /**
   * Set when the run itself threw (uncaught-error path → exit 1).
   *
   * NOTE (preserved, see TRANSFORMATION_NOTES Follow-up F1): in the legacy wiring
   * this branch is effectively dead — `runInspect` never passes `hadError`; an
   * uncaught error reaches `cli.ts`'s catch, which also yields 1. The param is kept
   * for behavioral parity; removing it is a consumer-wiring decision, not this
   * pure module's call.
   */
  readonly hadError?: boolean;
}

/**
 * Resolve the process exit code (RULE-030):
 *   - an uncaught run error (`hadError === true`) → 1
 *   - `--score` mode                              → 0 (never gates, even with errors)
 *   - gate tripped                                → 1
 *   - otherwise                                   → 0
 *
 * Returns the branded {@link ExitCode} (`0 | 1`). Precedence matches legacy
 * `exit-code.ts:56-60` exactly. The branded `PASS`/`FAIL` constants are returned
 * directly (provably in range), so no `Schema.decode` runs on the hot path.
 */
export const resolveExitCode = (inputs: ExitCodeInputs): ExitCode => {
  if (inputs.hadError === true) return FAIL;
  if (inputs.scoreMode) return PASS;
  return shouldFailForDiagnostics(inputs.diagnostics, inputs.failOn) ? FAIL : PASS;
};

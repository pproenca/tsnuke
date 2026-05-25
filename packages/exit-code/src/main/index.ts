/**
 * `@ts-doctor/exit-code-effect` — public surface of the Effect-TS exit-code slice.
 *
 * Implements RULE-030 (process exit-code resolution / `--fail-on` gate) and
 * RULE-031 (severity vocabulary, no `info`). See TRANSFORMATION_NOTES.md for the
 * legacy → target mapping, the (zero) behavioral deviations, and the follow-ups
 * recording RULE-030's suspected wiring defects (dead `hadError` branch; inert
 * `config.failOn`).
 *
 * The gate/resolver are plain synchronous pure functions (NOT `Effect`-wrapped);
 * the Effect ecosystem appears only in the contract types (`FailOn`/`Severity`/
 * `ExitCode` Schemas) and in `Match` for the failOn dispatch.
 */

// Contract layer (Schema literals / branded types).
export {
  FailOn,
  Severity,
  DEFAULT_FAIL_ON,
  decodeFailOn,
} from "./FailOn.js";

// `makeExitCode` (the validating constructor) stays in ExitCode.ts but is NOT
// re-exported: a 2-value domain has no meaningful trust boundary to decode at, so
// publishing it would be ceremony (cf. the score slice's barrel-hygiene lesson).
export { ExitCode, PASS, FAIL } from "./ExitCode.js";

// Logic layer (pure synchronous gate + resolver).
export {
  shouldFailForDiagnostics,
  resolveExitCode,
  type ExitCodeInputs,
} from "./resolve.js";

/**
 * `@ts-fix/exit-code-effect` — public surface of the Effect-TS exit-code slice.
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
 *
 * Exports are ordered schemas → types → functions, then closed by the self-barrel
 * `export * as ExitCodeModule from "."` so callers can reach the surface as a
 * namespace without colliding with the `ExitCode` schema named export. All named
 * re-exports stay byte-stable.
 */

// ---- Schemas + their derived types (the contract layer) ----
export {
  DEFAULT_FAIL_ON,
  FailOn,
  Severity,
  decodeFailOn,
} from "./FailOn.js";

// `makeExitCode` (the validating constructor) stays in ExitCode.ts but is NOT
// re-exported: a 2-value domain has no meaningful trust boundary to decode at, so
// publishing it would be ceremony (cf. the score slice's barrel-hygiene lesson).
export { ExitCode, FAIL, PASS } from "./ExitCode.js";

export type { ExitCodeInputs } from "./resolve.js";

// ---- Functions (pure synchronous gate + resolver) ----
export { resolveExitCode, shouldFailForDiagnostics } from "./resolve.js";

// ---- Self-barrel: THIS is the module's namespace ----
// Bound as `ExitCodeModule` (not `ExitCode`) because `ExitCode` is already the
// branded schema's named export — a `export * as ExitCode` would duplicate it.
export * as ExitCodeModule from "./index.js";

/**
 * Exit-code gate (BC-21) — carried verbatim from react-doctor's RULE-040.
 *
 * Pure functions over the `ciFailure`-relevant diagnostic set:
 *   - `--fail-on none`    → never fails (always exit 0)
 *   - `--fail-on warning` → fails if there is ANY diagnostic
 *   - `--fail-on error`   → fails only if there is an `error`-severity diagnostic
 *
 * `--score` mode never fails: the score is informational, not a gate.
 *
 * No `process.exit` here — these compute the *intended* code; the CLI edge calls
 * `process.exitCode = …` so the logic stays unit-testable.
 */
import type { Diagnostic } from "@ts-doctor/rules";
import type { FailOn } from "./flags.js";

/** Decide whether a diagnostic set trips the `--fail-on` gate. */
export function shouldFailForDiagnostics(
  diagnostics: readonly Pick<Diagnostic, "severity">[],
  failOn: FailOn,
): boolean {
  switch (failOn) {
    case "none":
      return false;
    case "warning":
      return diagnostics.length > 0;
    case "error":
      return diagnostics.some((d) => d.severity === "error");
    default: {
      // Exhaustiveness guard (noFallthroughCasesInSwitch + never check).
      const _never: never = failOn;
      return _never;
    }
  }
}

/** Inputs the exit-code resolver needs from a completed run. */
export interface ExitCodeInputs {
  diagnostics: readonly Pick<Diagnostic, "severity">[];
  failOn: FailOn;
  /** `--score` mode never gates (BC-21). */
  scoreMode: boolean;
  /** Set when the run itself threw (uncaught error path → exit 1). */
  hadError?: boolean;
}

/**
 * Resolve the process exit code:
 *   - an uncaught run error → 1
 *   - `--score` mode        → 0 (never gates, even with errors)
 *   - gate tripped          → 1
 *   - otherwise             → 0
 *
 * (SIGINT→130 and EPIPE→0 are handled at the process edge, not here.)
 */
export function resolveExitCode(inputs: ExitCodeInputs): 0 | 1 {
  if (inputs.hadError === true) return 1;
  if (inputs.scoreMode) return 0;
  return shouldFailForDiagnostics(inputs.diagnostics, inputs.failOn) ? 1 : 0;
}

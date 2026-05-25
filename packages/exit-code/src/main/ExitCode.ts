/**
 * The process exit code as a branded `0 | 1` literal (RULE-030).
 *
 * The resolver provably returns only `0` (pass) or `1` (fail) — the CI contract is
 * binary at this layer. (SIGINT→130 and EPIPE→0 are handled at the process edge in
 * `cli.ts`, NOT here — RULE-030; this module only computes the *intended* code so it
 * stays unit-testable, exactly as the legacy header notes.)
 *
 * Modeled as a branded `Schema.Literal(0, 1)` so a raw `number` can't be passed
 * where a resolved exit code is expected, lifting RULE-030's `0 | 1` postcondition
 * into the type. The brand is runtime-erased (compares to plain `0`/`1` via `toBe`).
 */

import { Schema } from "effect";

/** A resolved process exit code: `0` (pass) or `1` (fail). Branded (RULE-030). */
export const ExitCode = Schema.Literal(0, 1).pipe(
  Schema.brand("ExitCode"),
  Schema.annotations({ identifier: "ExitCode" }),
);
export type ExitCode = typeof ExitCode.Type;

/** Exit code for a passing run / gate not tripped. */
export const PASS: ExitCode = 0 as ExitCode;
/** Exit code for a failing run / gate tripped / uncaught error. */
export const FAIL: ExitCode = 1 as ExitCode;

/**
 * Construct an {@link ExitCode} from a TRUSTED, known-good number (literals, values
 * already proven to be `0`/`1`). Validates and THROWS `ParseError` otherwise — a
 * bad value is a loud programmer error. The resolver does not route through this;
 * it produces `PASS`/`FAIL` directly (provably in range).
 */
export const makeExitCode: (n: 0 | 1) => ExitCode = Schema.decodeSync(ExitCode);

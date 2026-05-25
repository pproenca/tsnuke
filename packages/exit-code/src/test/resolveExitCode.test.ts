/**
 * Characterization tests for `resolveExitCode` — RULE-030 (the resolver half).
 *
 * Written BEFORE the implementation; `../main/index.js` must make these pass and
 * must match the legacy oracle (`legacy/ts-doctor/.../exit-code.ts:56-60`) exactly.
 *
 * RULE-030 (resolver — precedence order is load-bearing):
 *   1. `hadError === true`  -> 1   (the run itself threw)
 *   2. else `scoreMode`     -> 0   (the score never gates, even with errors)
 *   3. else apply the gate  -> 1 if `shouldFailForDiagnostics` else 0
 *   The result is the `ExitCode` literal `0 | 1`.
 *
 * NOTE the precedence traps encoded here:
 *   - `hadError` beats `scoreMode` (a thrown run in --score mode still exits 1).
 *   - `scoreMode` beats the gate (errors present + --score -> still 0).
 *   - `hadError` is optional; `undefined`/`false` both fall through to the next rule.
 */

import { describe, expect, it } from "vitest";
import { resolveExitCode } from "../main/index.js";
import type { ExitCodeInputs, Severity } from "../main/index.js";

const sev = (severity: Severity): { severity: Severity } => ({ severity });
const EMPTY: ReadonlyArray<{ severity: Severity }> = [];
const WARNINGS_ONLY = [sev("warning")];
const HAS_ERROR = [sev("error")];

/** Build resolver inputs with sensible defaults; override per case. */
const inputs = (over: Partial<ExitCodeInputs>): ExitCodeInputs => ({
  diagnostics: EMPTY,
  failOn: "error",
  scoreMode: false,
  ...over,
});

describe("resolveExitCode — RULE-030 (hadError short-circuits to 1)", () => {
  it("hadError true -> 1, even in scoreMode", () => {
    expect(resolveExitCode(inputs({ hadError: true, scoreMode: true }))).toBe(1);
  });
  it("hadError true -> 1, even with failOn none and no diagnostics", () => {
    expect(
      resolveExitCode(inputs({ hadError: true, failOn: "none", diagnostics: EMPTY })),
    ).toBe(1);
  });
  it("hadError false -> falls through (no short-circuit)", () => {
    expect(resolveExitCode(inputs({ hadError: false, failOn: "none" }))).toBe(0);
  });
  it("hadError undefined -> falls through (no short-circuit)", () => {
    expect(resolveExitCode(inputs({ failOn: "none" }))).toBe(0);
  });
});

describe("resolveExitCode — RULE-030 (scoreMode never gates -> 0)", () => {
  it("scoreMode + has-error + failOn error -> 0 (score never gates)", () => {
    expect(
      resolveExitCode(inputs({ scoreMode: true, diagnostics: HAS_ERROR, failOn: "error" })),
    ).toBe(0);
  });
  it("scoreMode + warnings + failOn warning -> 0", () => {
    expect(
      resolveExitCode(
        inputs({ scoreMode: true, diagnostics: WARNINGS_ONLY, failOn: "warning" }),
      ),
    ).toBe(0);
  });
});

describe("resolveExitCode — RULE-030 (gate applied when not score/error)", () => {
  it("failOn error + has-error -> 1", () => {
    expect(resolveExitCode(inputs({ diagnostics: HAS_ERROR, failOn: "error" }))).toBe(1);
  });
  it("failOn error + warnings-only -> 0", () => {
    expect(
      resolveExitCode(inputs({ diagnostics: WARNINGS_ONLY, failOn: "error" })),
    ).toBe(0);
  });
  it("failOn warning + any diagnostic -> 1", () => {
    expect(
      resolveExitCode(inputs({ diagnostics: WARNINGS_ONLY, failOn: "warning" })),
    ).toBe(1);
  });
  it("failOn warning + empty -> 0", () => {
    expect(resolveExitCode(inputs({ diagnostics: EMPTY, failOn: "warning" }))).toBe(0);
  });
  it("failOn none + has-error -> 0 (gate never trips)", () => {
    expect(resolveExitCode(inputs({ diagnostics: HAS_ERROR, failOn: "none" }))).toBe(0);
  });
});

describe("resolveExitCode — RULE-030 (result is the 0|1 literal)", () => {
  it("returns exactly 0 or 1", () => {
    const a = resolveExitCode(inputs({ diagnostics: HAS_ERROR }));
    const b = resolveExitCode(inputs({ diagnostics: EMPTY }));
    expect([0, 1]).toContain(a);
    expect([0, 1]).toContain(b);
  });
});

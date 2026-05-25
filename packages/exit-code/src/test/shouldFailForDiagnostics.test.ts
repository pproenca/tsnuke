/**
 * Characterization tests for `shouldFailForDiagnostics` — RULE-030 (the gate half).
 *
 * These tests DEFINE "done" for the Effect-TS rewrite: the implementation in
 * `../main/index.js` is written AFTER these tests and must make them pass. They
 * are written against the legacy oracle (`legacy/ts-doctor/.../exit-code.ts:18-35`),
 * which the modern module must match EXACTLY — there is no rounding subtlety here,
 * so 100% equality is expected (the differential proof lives in equivalence.test.ts).
 *
 * RULE-030 (gate):
 *   - `none`    -> false (never fails)
 *   - `warning` -> true iff there is ANY diagnostic
 *   - `error`   -> true iff some diagnostic has severity === "error"
 *
 * RULE-031: severity is "error" | "warning" only — there is no "info" level.
 *
 * The input only needs `Pick<Diagnostic, "severity">` (scoring/exit reads severity).
 */

import { describe, expect, it } from "vitest";
import { shouldFailForDiagnostics } from "../main/index.js";
import type { Severity } from "../main/index.js";

/** A minimal diagnostic — the gate reads only `severity` (RULE-030). */
const sev = (severity: Severity): { severity: Severity } => ({ severity });

const EMPTY: ReadonlyArray<{ severity: Severity }> = [];
const WARNINGS_ONLY = [sev("warning"), sev("warning")];
const HAS_ERROR = [sev("warning"), sev("error"), sev("warning")];
const ERRORS_ONLY = [sev("error")];

describe("shouldFailForDiagnostics — RULE-030 (failOn = none)", () => {
  it("none + empty -> false", () => {
    expect(shouldFailForDiagnostics(EMPTY, "none")).toBe(false);
  });
  it("none + warnings-only -> false (never gates)", () => {
    expect(shouldFailForDiagnostics(WARNINGS_ONLY, "none")).toBe(false);
  });
  it("none + has-error -> false (never gates, even with errors)", () => {
    expect(shouldFailForDiagnostics(HAS_ERROR, "none")).toBe(false);
  });
});

describe("shouldFailForDiagnostics — RULE-030 (failOn = warning)", () => {
  it("warning + empty -> false (no diagnostics)", () => {
    expect(shouldFailForDiagnostics(EMPTY, "warning")).toBe(false);
  });
  it("warning + warnings-only -> true (ANY diagnostic trips it)", () => {
    expect(shouldFailForDiagnostics(WARNINGS_ONLY, "warning")).toBe(true);
  });
  it("warning + has-error -> true (ANY diagnostic, errors included)", () => {
    expect(shouldFailForDiagnostics(HAS_ERROR, "warning")).toBe(true);
  });
  it("warning + a single warning -> true", () => {
    expect(shouldFailForDiagnostics([sev("warning")], "warning")).toBe(true);
  });
});

describe("shouldFailForDiagnostics — RULE-030 (failOn = error)", () => {
  it("error + empty -> false", () => {
    expect(shouldFailForDiagnostics(EMPTY, "error")).toBe(false);
  });
  it("error + warnings-only -> false (no error-severity diagnostic)", () => {
    expect(shouldFailForDiagnostics(WARNINGS_ONLY, "error")).toBe(false);
  });
  it("error + has-error -> true (an error-severity diagnostic exists)", () => {
    expect(shouldFailForDiagnostics(HAS_ERROR, "error")).toBe(true);
  });
  it("error + errors-only -> true", () => {
    expect(shouldFailForDiagnostics(ERRORS_ONLY, "error")).toBe(true);
  });
});

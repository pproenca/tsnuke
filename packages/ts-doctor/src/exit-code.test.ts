import { describe, expect, it } from "vitest";
import { resolveExitCode, shouldFailForDiagnostics } from "./exit-code.js";

const err = { severity: "error" as const };
const warn = { severity: "warning" as const };

describe("BC-21 — shouldFailForDiagnostics", () => {
  it("failOn none never fails, even with errors", () => {
    expect(shouldFailForDiagnostics([err, warn], "none")).toBe(false);
    expect(shouldFailForDiagnostics([], "none")).toBe(false);
  });

  it("failOn warning fails if there is ANY diagnostic", () => {
    expect(shouldFailForDiagnostics([warn], "warning")).toBe(true);
    expect(shouldFailForDiagnostics([err], "warning")).toBe(true);
    expect(shouldFailForDiagnostics([], "warning")).toBe(false);
  });

  it("failOn error fails only when an error-severity diagnostic is present", () => {
    expect(shouldFailForDiagnostics([err], "error")).toBe(true);
    expect(shouldFailForDiagnostics([warn, warn], "error")).toBe(false);
    expect(shouldFailForDiagnostics([], "error")).toBe(false);
  });
});

describe("BC-21 — resolveExitCode", () => {
  it("returns 1 when the gate trips", () => {
    expect(resolveExitCode({ diagnostics: [err], failOn: "error", scoreMode: false })).toBe(1);
  });

  it("returns 0 when the gate does not trip", () => {
    expect(resolveExitCode({ diagnostics: [warn], failOn: "error", scoreMode: false })).toBe(0);
  });

  it("--score mode never fails, even with error diagnostics", () => {
    expect(resolveExitCode({ diagnostics: [err, err], failOn: "error", scoreMode: true })).toBe(0);
  });

  it("an uncaught run error forces exit 1", () => {
    expect(
      resolveExitCode({ diagnostics: [], failOn: "none", scoreMode: false, hadError: true }),
    ).toBe(1);
  });
});

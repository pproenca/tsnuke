/**
 * Characterization — BC-13 deterministic diagnostic identity.
 * Format: `filePath::line:column::plugin/rule` (legacy `identity.ts:12-14`).
 */

import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@ts-doctor/contracts-effect";
import { diagnosticIdentity } from "../main/index.js";

function diag(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    filePath: "src/foo.ts",
    plugin: "ts-doctor",
    rule: "no-explicit-any",
    severity: "warning",
    message: "m",
    help: "h",
    line: 12,
    column: 4,
    category: "Type Safety",
    tier: "SYN",
    ...overrides,
  };
}

describe("BC-13 — deterministic diagnostic identity", () => {
  it("has the exact format filePath::line:column::plugin/rule", () => {
    expect(diagnosticIdentity(diag())).toBe(
      "src/foo.ts::12:4::ts-doctor/no-explicit-any",
    );
  });

  it("is stable across repeated calls on the same diagnostic", () => {
    const d = diag();
    expect(diagnosticIdentity(d)).toBe(diagnosticIdentity(d));
  });

  it("distinguishes diagnostics that differ in any identity field", () => {
    const base = diag();
    expect(diagnosticIdentity(diag({ line: 13 }))).not.toBe(diagnosticIdentity(base));
    expect(diagnosticIdentity(diag({ column: 5 }))).not.toBe(diagnosticIdentity(base));
    expect(diagnosticIdentity(diag({ rule: "no-ts-ignore" }))).not.toBe(
      diagnosticIdentity(base),
    );
    expect(diagnosticIdentity(diag({ filePath: "src/bar.ts" }))).not.toBe(
      diagnosticIdentity(base),
    );
    expect(diagnosticIdentity(diag({ plugin: "other" }))).not.toBe(
      diagnosticIdentity(base),
    );
  });

  it("is independent of non-identity fields (message/severity/tier/help)", () => {
    expect(
      diagnosticIdentity(diag({ message: "x", severity: "error", tier: "TYP", help: "z" })),
    ).toBe(diagnosticIdentity(diag()));
  });
});

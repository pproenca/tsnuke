import { describe, expect, it } from "vitest";
import type { Diagnostic, RuleMeta } from "@ts-doctor/rules";
import { asRuleLookup, explain, explainDiagnostic } from "./explain.js";

const registry: Record<string, RuleMeta> = {
  "no-explicit-any": {
    id: "no-explicit-any",
    severity: "warning",
    category: "Type Safety",
    tier: "SYN",
    fixKind: "manual",
    recommendation: "Replace `any` with a precise type or `unknown` (then narrow).",
  },
  "no-floating-promises": {
    id: "no-floating-promises",
    severity: "error",
    category: "Async / Promises",
    tier: "TYP",
    fixKind: "auto-fix",
    recommendation: "`await` the promise or explicitly `void` it.",
  },
};

const lookup = asRuleLookup(registry);

describe("explain — offline, deterministic", () => {
  it("returns the static recommendation + metadata for a known rule (no network)", () => {
    const out = explain("no-explicit-any", lookup);
    expect(out).toContain("no-explicit-any");
    expect(out).toContain("[SYN]");
    expect(out).toContain("Type Safety");
    expect(out).toContain("Replace `any` with a precise type");
    expect(out).toContain("Fix kind: manual");
  });

  it("is deterministic — identical output across calls", () => {
    expect(explain("no-explicit-any", lookup)).toBe(explain("no-explicit-any", lookup));
  });

  it("reports an unknown rule gracefully", () => {
    expect(explain("does-not-exist", lookup)).toContain("Unknown rule");
  });

  it("surfaces help + inferredType from a concrete diagnostic", () => {
    const d: Diagnostic = {
      filePath: "/repo/src/x.ts",
      plugin: "ts-doctor",
      rule: "no-floating-promises",
      severity: "error",
      message: "Floating promise.",
      help: "This promise is neither awaited nor handled.",
      line: 10,
      column: 3,
      category: "Async / Promises",
      tier: "TYP",
      fix: { kind: "auto-fix", edits: [], inferredType: "Promise<void>" },
    };
    const out = explainDiagnostic(d, lookup);
    expect(out).toContain("This promise is neither awaited nor handled.");
    expect(out).toContain("Inferred type: Promise<void>");
    expect(out).toContain("`await` the promise");
  });
});

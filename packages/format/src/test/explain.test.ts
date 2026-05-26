import { describe, expect, it } from "vitest";
import type { Diagnostic, RuleMeta } from "@tsnuke/contracts-effect";
import { asRuleLookup, explain, explainDiagnostic } from "../main/index.js";

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
  it("renders id chip + tier/category/severity + fix-kind + recommendation", () => {
    const out = explain("no-explicit-any", lookup);
    expect(out).toContain("no-explicit-any");
    expect(out).toContain("[SYN · Type Safety · warning]");
    expect(out).toContain("Fix: manual");
    expect(out).toContain("Replace `any`");
  });

  it("is deterministic — identical output across calls", () => {
    expect(explain("no-explicit-any", lookup)).toBe(explain("no-explicit-any", lookup));
  });

  it("reports an unknown rule gracefully", () => {
    expect(explain("does-not-exist", lookup)).toContain("Unknown rule");
  });

  it("appends the documentation URL to the fix chip when provided", () => {
    const out = explain("no-explicit-any", lookup, { url: "https://tsnuke.dev/r/no-explicit-any" });
    expect(out).toContain("Fix: manual · https://tsnuke.dev/r/no-explicit-any");
  });

  it("renders help text under the chip when provided", () => {
    const out = explain("no-explicit-any", lookup, { help: "Use `unknown` instead." });
    expect(out).toContain("Use `unknown` instead.");
  });

  it("surfaces inferredType + occurrencesInRun when provided", () => {
    const out = explain("no-floating-promises", lookup, {
      inferredType: "Promise<Response>",
      occurrencesInRun: 3,
    });
    expect(out).toContain("Inferred type: Promise<Response>");
    expect(out).toContain("Occurrences in this run: 3");
  });

  it("does not render occurrencesInRun when it is 0", () => {
    const out = explain("no-floating-promises", lookup, { occurrencesInRun: 0 });
    expect(out).not.toContain("Occurrences in this run");
  });

  it("explainDiagnostic forwards help + inferredType + url to the renderer", () => {
    const d: Diagnostic = {
      filePath: "/repo/src/x.ts",
      plugin: "tsnuke",
      rule: "no-floating-promises",
      severity: "error",
      message: "Floating promise.",
      help: "This promise is neither awaited nor handled.",
      url: "https://tsnuke.dev/r/no-floating-promises",
      line: 10,
      column: 3,
      category: "Async / Promises",
      tier: "TYP",
      fix: { kind: "auto-fix", edits: [], inferredType: "Promise<void>" },
    };
    const out = explainDiagnostic(d, lookup);
    expect(out).toContain("Fix: auto-fix · https://tsnuke.dev/r/no-floating-promises");
    expect(out).toContain("This promise is neither awaited nor handled.");
    expect(out).toContain("Inferred type: Promise<void>");
    expect(out).toContain("`await` the promise");
  });

  it("asRuleLookup does not resolve inherited Object.prototype keys", () => {
    expect(explain("toString", lookup)).toContain("Unknown rule");
  });

  it("defaults fix kind to manual when meta omits fixKind", () => {
    const bare = asRuleLookup({
      "bare-rule": { id: "bare-rule", severity: "warning", category: "Misc", tier: "GRAPH" },
    });
    expect(explain("bare-rule", bare)).toContain("Fix: manual");
  });
});

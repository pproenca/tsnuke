import { describe, expect, it } from "vitest";
import type { Diagnostic, RuleMeta } from "@tsnuke/contracts-effect";
import { asRuleLookup, explain, explainDiagnostic } from "../main/index.js";
import {
  frozenAsRuleLookup,
  frozenExplain,
  frozenExplainDiagnostic,
  type FrozenDiagnostic,
  type FrozenRuleMeta,
} from "./legacy-frozen.js";

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

describe("explain — offline, deterministic (ported legacy vectors)", () => {
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
      plugin: "tsnuke",
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

describe("explain — exact output strings (added)", () => {
  it("renders the full known-rule block VERBATIM (header + recommendation + fix kind)", () => {
    expect(explain("no-explicit-any", lookup)).toBe(
      [
        "no-explicit-any  [SYN] (Type Safety, warning)",
        "",
        "Recommendation: Replace `any` with a precise type or `unknown` (then narrow).",
        "",
        "Fix kind: manual",
      ].join("\n"),
    );
  });

  it("renders the unknown-rule message VERBATIM", () => {
    expect(explain("does-not-exist", lookup)).toBe(
      'Unknown rule "does-not-exist". No such rule in the tsnuke catalog.',
    );
  });

  it("header-only when a rule has no recommendation / fixKind", () => {
    const bare = asRuleLookup({
      "bare-rule": { id: "bare-rule", severity: "warning", category: "Misc", tier: "GRAPH" },
    });
    expect(explain("bare-rule", bare)).toBe("bare-rule  [GRAPH] (Misc, warning)");
  });

  it("explainDiagnostic full block VERBATIM (header + help + recommendation + inferredType + fix kind)", () => {
    const d: Diagnostic = {
      filePath: "/repo/src/x.ts",
      plugin: "tsnuke",
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
    expect(explainDiagnostic(d, lookup)).toBe(
      [
        "no-floating-promises  [TYP] (Async / Promises, error)",
        "",
        "This promise is neither awaited nor handled.",
        "",
        "Recommendation: `await` the promise or explicitly `void` it.",
        "",
        "Inferred type: Promise<void>",
        "",
        "Fix kind: auto-fix",
      ].join("\n"),
    );
  });

  it("asRuleLookup does not resolve inherited Object.prototype keys", () => {
    // "toString" exists on Object.prototype but not as an own key → undefined.
    expect(explain("toString", lookup)).toContain("Unknown rule");
  });
});

describe("equivalence vs frozen legacy explain", () => {
  const frozenRegistry: Record<string, FrozenRuleMeta> = registry as Record<string, FrozenRuleMeta>;
  const frozenLookup = frozenAsRuleLookup(frozenRegistry);

  it("explain matches the frozen oracle for known + unknown rules", () => {
    for (const id of ["no-explicit-any", "no-floating-promises", "nope"]) {
      expect(explain(id, lookup)).toBe(frozenExplain(id, frozenLookup));
    }
  });

  it("explain matches with a help+inferredType context", () => {
    const ctx = { help: "some help", inferredType: "Foo<Bar>" };
    expect(explain("no-explicit-any", lookup, ctx)).toBe(
      frozenExplain("no-explicit-any", frozenLookup, ctx),
    );
  });

  it("explainDiagnostic matches the frozen oracle", () => {
    const d: FrozenDiagnostic = {
      filePath: "/repo/src/x.ts",
      plugin: "tsnuke",
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
    expect(explainDiagnostic(d as unknown as Diagnostic, lookup)).toBe(
      frozenExplainDiagnostic(d, frozenLookup),
    );
  });
});

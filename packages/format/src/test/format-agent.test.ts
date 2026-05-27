import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@tsnuke/contracts-effect";
import { derivePartialReason, formatAgentReport } from "../main/index.js";

/** Build a plain Diagnostic literal for tests. */
function diag(over: Partial<Diagnostic> & Pick<Diagnostic, "rule">): Diagnostic {
  return {
    filePath: "/repo/src/a.ts",
    plugin: "tsnuke",
    severity: "warning",
    message: `msg-${over.rule}`,
    help: `help-${over.rule}`,
    line: 1,
    column: 1,
    category: "Type Safety",
    tier: "SYN",
    ...over,
  };
}

describe("formatAgentReport — rule dedup + sort", () => {
  it("deduplicates a rule fired 3x into one entry with 3 occurrences", () => {
    const diagnostics = [
      diag({ rule: "no-any", filePath: "/repo/src/a.ts", line: 1, column: 1 }),
      diag({ rule: "no-any", filePath: "/repo/src/a.ts", line: 5, column: 2 }),
      diag({ rule: "no-any", filePath: "/repo/src/b.ts", line: 9, column: 3 }),
    ];
    const report = formatAgentReport(diagnostics, { score: 90, label: "Great" }, "/repo");
    expect(report.ruleCount).toBe(1);
    expect(report.occurrenceCount).toBe(3);
    const entry = report.categories[0]?.rules[0];
    expect(entry?.rule).toBe("no-any");
    expect(entry?.occurrences.length).toBe(3);
  });

  it("sorts entries by tier then fixKind (auto-fix first)", () => {
    const diagnostics = [
      diag({ rule: "cfg-rule", tier: "CFG", category: "C" }),
      diag({ rule: "syn-manual", tier: "SYN", category: "C", fix: { kind: "manual", edits: [] } }),
      diag({ rule: "syn-autofix", tier: "SYN", category: "C", fix: { kind: "auto-fix", edits: [] } }),
      diag({ rule: "typ-rule", tier: "TYP", category: "C" }),
    ];
    const report = formatAgentReport(diagnostics, null, "/repo");
    const order = report.categories.flatMap((c) => c.rules.map((r) => r.rule));
    expect(order).toEqual(["syn-autofix", "syn-manual", "typ-rule", "cfg-rule"]);
  });

  it("groups by category, categories alphabetical", () => {
    const diagnostics = [
      diag({ rule: "z-rule", category: "Zeta" }),
      diag({ rule: "a-rule", category: "Alpha" }),
    ];
    const report = formatAgentReport(diagnostics, null, "/repo");
    expect(report.categories.map((c) => c.category)).toEqual(["Alpha", "Zeta"]);
  });

  it("strips the repo root, making file paths repo-relative", () => {
    const report = formatAgentReport(
      [diag({ rule: "r", filePath: "/repo/src/deep/x.ts" })],
      null,
      "/repo",
    );
    expect(report.categories[0]?.rules[0]?.occurrences[0]?.filePath).toBe("src/deep/x.ts");
  });

  it("preserves an optional url and omits it when absent", () => {
    const report = formatAgentReport(
      [
        diag({ rule: "with-url", url: "https://example.test/r" }),
        diag({ rule: "no-url", category: "Other" }),
      ],
      null,
    );
    const all = report.categories.flatMap((c) => c.rules);
    const withUrl = all.find((r) => r.rule === "with-url");
    const noUrl = all.find((r) => r.rule === "no-url");
    expect(withUrl?.url).toBe("https://example.test/r");
    expect(Object.prototype.hasOwnProperty.call(noUrl ?? {}, "url")).toBe(false);
  });

  it("is deterministic: same input → identical JSON", () => {
    const diagnostics = [
      diag({ rule: "b", category: "Two", filePath: "/repo/b.ts", line: 3 }),
      diag({ rule: "a", category: "One", filePath: "/repo/a.ts", line: 1 }),
      diag({ rule: "a", category: "One", filePath: "/repo/a.ts", line: 2 }),
    ];
    const a = JSON.stringify(
      formatAgentReport(diagnostics, { score: 50, label: "Needs work" }, "/repo"),
    );
    const b = JSON.stringify(
      formatAgentReport(diagnostics, { score: 50, label: "Needs work" }, "/repo"),
    );
    expect(a).toBe(b);
  });
});

describe("formatAgentReport — RULE-032 fix-kind ordering", () => {
  it("orders auto-fix (0) < codemod (1) < manual (2) within one tier", () => {
    const diagnostics = [
      diag({ rule: "r-nofix", tier: "SYN", category: "C" }),
      diag({ rule: "r-manual", tier: "SYN", category: "C", fix: { kind: "manual", edits: [] } }),
      diag({ rule: "r-codemod", tier: "SYN", category: "C", fix: { kind: "codemod", edits: [] } }),
      diag({ rule: "r-autofix", tier: "SYN", category: "C", fix: { kind: "auto-fix", edits: [] } }),
    ];
    const report = formatAgentReport(diagnostics, null);
    const order = report.categories.flatMap((c) => c.rules.map((r) => r.rule));
    expect(order).toEqual(["r-autofix", "r-codemod", "r-manual", "r-nofix"]);
  });

  it("no-fix diagnostic defaults its agent fixKind to manual", () => {
    const report = formatAgentReport([diag({ rule: "no-fix-rule" })], null);
    expect(report.categories[0]?.rules[0]?.fixKind).toBe("manual");
  });

  it("tier dominates fixKind: a CFG auto-fix sorts after a SYN manual", () => {
    const diagnostics = [
      diag({ rule: "cfg-autofix", tier: "CFG", category: "C", fix: { kind: "auto-fix", edits: [] } }),
      diag({ rule: "syn-manual", tier: "SYN", category: "C", fix: { kind: "manual", edits: [] } }),
    ];
    const report = formatAgentReport(diagnostics, null);
    const order = report.categories.flatMap((c) => c.rules.map((r) => r.rule));
    expect(order).toEqual(["syn-manual", "cfg-autofix"]);
  });

  it("score=null yields null score + scoreLabel; counts still populated", () => {
    const report = formatAgentReport([diag({ rule: "x" }), diag({ rule: "x", line: 2 })], null);
    expect(report.score).toBeNull();
    expect(report.scoreLabel).toBeNull();
    expect(report.ruleCount).toBe(1);
    expect(report.occurrenceCount).toBe(2);
  });
});

describe("formatAgentReport — agent-facing summaries", () => {
  it("reports per-fix-kind counts in fixSummary", () => {
    const diagnostics = [
      diag({ rule: "a", fix: { kind: "auto-fix", edits: [] } }),
      diag({ rule: "b", fix: { kind: "auto-fix", edits: [] } }),
      diag({ rule: "c", fix: { kind: "codemod", edits: [] } }),
      diag({ rule: "d" }), // no fix → manual
    ];
    const report = formatAgentReport(diagnostics, null);
    expect(report.fixSummary.autoFixable).toBe(2);
    expect(report.fixSummary.codemod).toBe(1);
    expect(report.fixSummary.manual).toBe(1);
  });

  it("reports a tier breakdown with zeros for tiers that didn't fire", () => {
    const diagnostics = [
      diag({ rule: "a", tier: "SYN" }),
      diag({ rule: "b", tier: "TYP" }),
      diag({ rule: "b", tier: "TYP", line: 2 }),
    ];
    const report = formatAgentReport(diagnostics, null);
    expect(report.tierBreakdown.SYN).toEqual({ rules: 1, occurrences: 1 });
    expect(report.tierBreakdown.TYP).toEqual({ rules: 1, occurrences: 2 });
    expect(report.tierBreakdown.GRAPH).toEqual({ rules: 0, occurrences: 0 });
    expect(report.tierBreakdown.CFG).toEqual({ rules: 0, occurrences: 0 });
  });

  it("nextAction.kind=run-fix when auto-fixables exist, listing rule ids", () => {
    const diagnostics = [
      diag({ rule: "fixable-1", fix: { kind: "auto-fix", edits: [] } }),
      diag({ rule: "fixable-2", fix: { kind: "auto-fix", edits: [] } }),
      diag({ rule: "manual-1" }),
    ];
    const report = formatAgentReport(diagnostics, null);
    expect(report.nextAction.kind).toBe("run-fix");
    expect(report.nextAction.autoFixableRules).toEqual(["fixable-1", "fixable-2"]);
    expect(report.nextAction.summary).toContain("--fix");
  });

  it("nextAction.kind=address-rule when nothing is auto-fixable", () => {
    const diagnostics = [
      diag({ rule: "a" }),
      diag({ rule: "b", line: 2 }),
      diag({ rule: "b", line: 3 }),
    ];
    const report = formatAgentReport(diagnostics, null);
    expect(report.nextAction.kind).toBe("address-rule");
    expect(report.nextAction.focusRule).toBe("b"); // highest occurrence count
  });

  it("nextAction.kind=all-clear on a clean run", () => {
    const report = formatAgentReport([], null);
    expect(report.nextAction.kind).toBe("all-clear");
  });

  it("threads meta.elapsedMs and meta.scorePartial onto the report", () => {
    const report = formatAgentReport([], null, "", { elapsedMs: 421, scorePartial: true });
    expect(report.elapsedMs).toBe(421);
    expect(report.scorePartial).toBe(true);
  });

  it("defaults elapsedMs to 0 and scorePartial to false when meta omitted", () => {
    const report = formatAgentReport([], null);
    expect(report.elapsedMs).toBe(0);
    expect(report.scorePartial).toBe(false);
  });
});

// =============================================================================
// P1 (honest scoring): partial scores never carry a band label, and the agent JSON
// surfaces the partial reason + the score-formula breakdown so deltas are derivable.
// =============================================================================
describe("formatAgentReport — partial-score honesty (P1)", () => {
  it("drops scoreLabel to null when scorePartial: true (no 'Great' on a partial measurement)", () => {
    const report = formatAgentReport([], { score: 90, label: "Great" }, "", {
      scorePartial: true,
      partialReason: "typecheck-failed",
    });
    expect(report.score).toBe(90);
    expect(report.scoreLabel).toBeNull();
    expect(report.scorePartial).toBe(true);
    expect(report.partialReason).toBe("typecheck-failed");
  });

  it("keeps scoreLabel when scorePartial: false (full-tier scores earn the band)", () => {
    const report = formatAgentReport([], { score: 90, label: "Great" }, "", {
      scorePartial: false,
    });
    expect(report.scoreLabel).toBe("Great");
    expect(report.partialReason).toBeNull();
  });

  it("scoreBreakdown reproduces the score formula (100 − 1.5×err − 0.75×warn)", () => {
    const errDiag = (n: number) =>
      Array.from({ length: 1 }, (_, i) => ({
        plugin: "tsnuke",
        rule: `err${n}-${i}`,
        severity: "error" as const,
        tier: "SYN" as const,
        category: "x",
        message: "",
        help: "",
        filePath: "/a.ts",
        line: 1,
        column: 1,
      }));
    const warnDiag = (n: number) =>
      Array.from({ length: 1 }, (_, i) => ({
        plugin: "tsnuke",
        rule: `warn${n}-${i}`,
        severity: "warning" as const,
        tier: "SYN" as const,
        category: "x",
        message: "",
        help: "",
        filePath: "/a.ts",
        line: 1,
        column: 1,
      }));
    const diags = [...errDiag(1), ...errDiag(2), ...warnDiag(1), ...warnDiag(2), ...warnDiag(3)];
    const report = formatAgentReport(diags, { score: 95, label: "Great" });
    // 2 distinct error rules × 1.5 = 3.0 ; 3 distinct warning rules × 0.75 = 2.25
    expect(report.scoreBreakdown).toEqual({
      base: 100,
      errorPenalty: { count: 2, weight: 1.5, total: 3 },
      warningPenalty: { count: 3, weight: 0.75, total: 2.25 },
    });
  });

  it("scoreBreakdown is present even when score is null (zero counts)", () => {
    const report = formatAgentReport([], null);
    expect(report.scoreBreakdown).toEqual({
      base: 100,
      errorPenalty: { count: 0, weight: 1.5, total: 0 },
      warningPenalty: { count: 0, weight: 0.75, total: 0 },
    });
  });
});

describe("derivePartialReason — engine reason → enum vocabulary", () => {
  it("classifies the typecheck-failed sentinel", () => {
    const reasons = { "tsnuke/no-floating-promises": "Tier-2 (type-aware) skipped: project does not type-check (typecheck:ok absent)." };
    expect(derivePartialReason(reasons)).toBe("typecheck-failed");
  });

  it("classifies --no-deep, memory, returns null for unknown / empty", () => {
    expect(derivePartialReason({ x: "Tier-2 (type-aware) skipped: --no-deep (type-aware pass disabled)." })).toBe("no-deep");
    expect(derivePartialReason({ x: "Tier-2 (type-aware) skipped: memory ceiling would be exceeded (RULE-013 graceful degradation)." })).toBe("memory");
    expect(derivePartialReason({})).toBeNull();
    expect(derivePartialReason(undefined)).toBeNull();
    expect(derivePartialReason({ x: "totally different reason" })).toBeNull();
  });
});

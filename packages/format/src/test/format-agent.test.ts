import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@ts-doctor/contracts-effect";
import { formatAgentReport } from "../main/index.js";
import { frozenFormatAgentReport, type FrozenDiagnostic } from "./legacy-frozen.js";

/** Build a plain Diagnostic literal for tests (ported from the legacy fixture). */
function diag(over: Partial<Diagnostic> & Pick<Diagnostic, "rule">): Diagnostic {
  return {
    filePath: "/repo/src/a.ts",
    plugin: "ts-doctor",
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

describe("C14 — formatAgentReport (ported legacy vectors)", () => {
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
      diag({
        rule: "syn-manual",
        tier: "SYN",
        category: "C",
        fix: { kind: "manual", edits: [] },
      }),
      diag({
        rule: "syn-autofix",
        tier: "SYN",
        category: "C",
        fix: { kind: "auto-fix", edits: [] },
      }),
      diag({ rule: "typ-rule", tier: "TYP", category: "C" }),
    ];
    const report = formatAgentReport(diagnostics, null, "/repo");
    // All in one category "C". Order should be: SYN auto-fix, SYN manual, TYP, CFG.
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

describe("RULE-032 — fix-kind taxonomy & agent action ordering (added)", () => {
  it("orders auto-fix (0) < codemod (1) < manual (2) within one tier, no-fix → manual (last)", () => {
    const diagnostics = [
      diag({ rule: "r-nofix", tier: "SYN", category: "C" }), // no fix → manual (2)
      diag({ rule: "r-manual", tier: "SYN", category: "C", fix: { kind: "manual", edits: [] } }),
      diag({ rule: "r-codemod", tier: "SYN", category: "C", fix: { kind: "codemod", edits: [] } }),
      diag({ rule: "r-autofix", tier: "SYN", category: "C", fix: { kind: "auto-fix", edits: [] } }),
    ];
    const report = formatAgentReport(diagnostics, null);
    const order = report.categories.flatMap((c) => c.rules.map((r) => r.rule));
    // auto-fix, codemod, then the two manual-kind (manual tie broken by rule.localeCompare:
    // "r-manual" < "r-nofix").
    expect(order).toEqual(["r-autofix", "r-codemod", "r-manual", "r-nofix"]);
  });

  it("a diagnostic with no fix defaults its agent fixKind to \"manual\"", () => {
    const report = formatAgentReport([diag({ rule: "no-fix-rule" })], null);
    expect(report.categories[0]?.rules[0]?.fixKind).toBe("manual");
  });

  it("tier dominates fixKind: a CFG auto-fix still sorts after a SYN manual", () => {
    const diagnostics = [
      diag({ rule: "cfg-autofix", tier: "CFG", category: "C", fix: { kind: "auto-fix", edits: [] } }),
      diag({ rule: "syn-manual", tier: "SYN", category: "C", fix: { kind: "manual", edits: [] } }),
    ];
    const report = formatAgentReport(diagnostics, null);
    const order = report.categories.flatMap((c) => c.rules.map((r) => r.rule));
    expect(order).toEqual(["syn-manual", "cfg-autofix"]);
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

  it("score=null yields null score + scoreLabel; counts still populated", () => {
    const report = formatAgentReport([diag({ rule: "x" }), diag({ rule: "x", line: 2 })], null);
    expect(report.score).toBeNull();
    expect(report.scoreLabel).toBeNull();
    expect(report.ruleCount).toBe(1);
    expect(report.occurrenceCount).toBe(2);
  });
});

describe("equivalence vs frozen legacy formatAgentReport", () => {
  // Crafted inputs that exercise dedup, all three fix kinds + no-fix, every tier,
  // multiple categories, repo-root stripping, occurrence sort, and the null score.
  const crafted: FrozenDiagnostic[] = [
    { filePath: "/repo/src/z.ts", plugin: "ts-doctor", rule: "syn-cm", severity: "warning", message: "m1", help: "h1", line: 10, column: 4, category: "Zeta", tier: "SYN", fix: { kind: "codemod", edits: [] } },
    { filePath: "/repo/src/a.ts", plugin: "ts-doctor", rule: "syn-cm", severity: "warning", message: "m1", help: "h1", line: 2, column: 1, category: "Zeta", tier: "SYN", fix: { kind: "codemod", edits: [] } },
    { filePath: "/repo/src/a.ts", plugin: "ts-doctor", rule: "syn-af", severity: "error", message: "m2", help: "h2", url: "https://x.test", line: 1, column: 1, category: "Alpha", tier: "SYN", fix: { kind: "auto-fix", edits: [] } },
    { filePath: "/repo/src/b.ts", plugin: "ts-doctor", rule: "typ-x", severity: "warning", message: "m3", help: "h3", line: 3, column: 7, category: "Alpha", tier: "TYP" },
    { filePath: "/repo/src/c.ts", plugin: "ts-doctor", rule: "graph-y", severity: "warning", message: "m4", help: "h4", line: 4, column: 2, category: "Mid", tier: "GRAPH", fix: { kind: "manual", edits: [] } },
    { filePath: "/repo/src/d.ts", plugin: "ts-doctor", rule: "cfg-z", severity: "error", message: "m5", help: "h5", line: 5, column: 9, category: "Mid", tier: "CFG" },
  ];

  const ported = crafted as unknown as Diagnostic[];

  it("deep-equals the frozen oracle (with score, repoRoot stripped)", () => {
    const score = { score: 73, label: "Needs work" };
    expect(formatAgentReport(ported, score, "/repo")).toEqual(
      frozenFormatAgentReport(crafted, score, "/repo"),
    );
  });

  it("deep-equals the frozen oracle (null score, no repoRoot)", () => {
    expect(formatAgentReport(ported, null)).toEqual(frozenFormatAgentReport(crafted, null));
  });

  it("JSON-equals the frozen oracle byte-for-byte", () => {
    const score = { score: 0, label: "Critical" };
    expect(JSON.stringify(formatAgentReport(ported, score, "/repo"))).toBe(
      JSON.stringify(frozenFormatAgentReport(crafted, score, "/repo")),
    );
  });
});

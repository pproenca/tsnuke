import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@ts-doctor/rules";
import { formatAgentReport } from "./format-agent.js";

/** Build a plain Diagnostic literal for tests. */
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

describe("C14 — formatAgentReport", () => {
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
    const a = JSON.stringify(formatAgentReport(diagnostics, { score: 50, label: "Needs work" }, "/repo"));
    const b = JSON.stringify(formatAgentReport(diagnostics, { score: 50, label: "Needs work" }, "/repo"));
    expect(a).toBe(b);
  });
});

import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@tsnuke/contracts-effect";
import { renderPretty, renderScoreLine } from "../main/index.js";

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

describe("renderScoreLine", () => {
  it("renders n/a when score is null", () => {
    expect(renderScoreLine(null, false)).toBe("Score: n/a");
    expect(renderScoreLine(null, true)).toBe("Score: n/a");
  });

  it("renders the score number + label for each band (no colour)", () => {
    expect(renderScoreLine({ score: 92, label: "Great", partial: false }, false)).toBe(
      "Score: 92/100 — Great",
    );
    expect(renderScoreLine({ score: 58, label: "Needs work", partial: false }, false)).toBe(
      "Score: 58/100 — Needs work",
    );
    expect(renderScoreLine({ score: 11, label: "Critical", partial: false }, false)).toBe(
      "Score: 11/100 — Critical",
    );
  });

  it("appends a partial note when scorePartial is true", () => {
    expect(renderScoreLine({ score: 80, label: "Great", partial: true }, true)).toBe(
      "Score: 80/100 — Great (partial — type info unavailable, not comparable)",
    );
  });

  it("ignores score.partial — uses the explicit scorePartial parameter", () => {
    expect(renderScoreLine({ score: 80, label: "Great", partial: true }, false)).toBe(
      "Score: 80/100 — Great",
    );
  });

  it("emits ANSI escapes when color=true", () => {
    const out = renderScoreLine({ score: 90, label: "Great", partial: false }, false, { color: true });
    expect(out).toContain("\x1b[");
    expect(out).toContain("90/100");
    expect(out).toContain("Great");
  });
});

describe("renderPretty — doctor-style header", () => {
  it("shows the face/score/label/bar when showScore is true", () => {
    const out = renderPretty(
      [diag({ rule: "r" })],
      { score: 92, label: "Great", partial: false },
      false,
    );
    expect(out).toContain("◠ ◠"); // happy face for ≥ 75
    expect(out).toContain("92 / 100");
    expect(out).toContain("Great");
    expect(out).toContain("█"); // bar is rendered
  });

  it("switches face by band (neutral / sad)", () => {
    const needsWork = renderPretty([diag({ rule: "r" })], { score: 60, label: "Needs work", partial: false }, false);
    expect(needsWork).toContain("• •");

    const critical = renderPretty([diag({ rule: "r" })], { score: 20, label: "Critical", partial: false }, false);
    expect(critical).toContain("x x");
  });

  it("omits the score header when showScore is false", () => {
    const out = renderPretty(
      [],
      { score: 100, label: "Great", partial: false },
      false,
      { showScore: false },
    );
    expect(out).not.toContain("/ 100");
  });
});

describe("renderPretty — tier line + rule grouping + footer", () => {
  it("groups diagnostics by category, rule-deduplicated with ×N", () => {
    const diagnostics = [
      diag({ rule: "z-rule", category: "Zeta", filePath: "/repo/z.ts", line: 9, column: 2, severity: "warning" }),
      diag({ rule: "z-rule", category: "Zeta", filePath: "/repo/z.ts", line: 10, column: 2, severity: "warning" }),
      diag({ rule: "a-rule", category: "Alpha", filePath: "/repo/a.ts", line: 1, column: 3, severity: "error" }),
    ];
    const out = renderPretty(diagnostics, { score: 50, label: "Needs work", partial: false }, false);

    // Categories sorted alphabetically.
    expect(out.indexOf("Alpha")).toBeLessThan(out.indexOf("Zeta"));
    // Rule deduplicated: z-rule appears once with the count.
    expect(out).toContain("z-rule");
    expect(out).toContain("×2");
    // Error icon for severity=error, warning icon for severity=warning.
    expect(out).toContain("✗");
    expect(out).toContain("⚠");
  });

  it("emits the Tier breakdown line when at least one rule fired", () => {
    const diagnostics = [
      diag({ rule: "syn-r", tier: "SYN" }),
      diag({ rule: "typ-r", tier: "TYP" }),
    ];
    const out = renderPretty(diagnostics, { score: 70, label: "Needs work", partial: false }, false);
    expect(out).toContain("Tiers");
    expect(out).toContain("SYN");
    expect(out).toContain("TYP");
    expect(out).toContain("GRAPH");
    expect(out).toContain("CFG");
    expect(out).toContain("●");
  });

  it("footer reports the rule + file totals and the CTA from deriveNextAction", () => {
    const diagnostics = [
      diag({ rule: "fixable", fix: { kind: "auto-fix", edits: [] } }),
      diag({ rule: "fixable", filePath: "/repo/src/b.ts", line: 5, fix: { kind: "auto-fix", edits: [] } }),
      diag({ rule: "manual-rule" }),
    ];
    const out = renderPretty(diagnostics, { score: 60, label: "Needs work", partial: false }, false, {
      rulesChecked: 88,
      elapsedMs: 1234,
    });
    expect(out).toContain("3 issues across 2 files");
    expect(out).toContain("88 rules checked");
    expect(out).toContain("1.23s");
    expect(out).toContain("Run `tsnuke --fix`");
    expect(out).toContain("auto-resolve 2");

    const subSecond = renderPretty(diagnostics, { score: 60, label: "Needs work", partial: false }, false, {
      rulesChecked: 88,
      elapsedMs: 420,
    });
    expect(subSecond).toContain("420ms");
  });

  it("clean run shows the all-clear footer", () => {
    const out = renderPretty([], { score: 100, label: "Great", partial: false }, false, { rulesChecked: 88 });
    expect(out).toContain("0 issues");
    expect(out).toContain("All clear");
  });

  it("collapses occurrences past 3 in non-verbose mode and expands under --verbose", () => {
    const fives: Diagnostic[] = Array.from({ length: 5 }, (_, i) =>
      diag({ rule: "r", filePath: `/repo/src/${i}.ts`, line: i + 1 }),
    );
    const defaultOut = renderPretty(fives, { score: 80, label: "Great", partial: false }, false);
    expect(defaultOut).toContain("+2 more");
    const verboseOut = renderPretty(fives, { score: 80, label: "Great", partial: false }, false, { verbose: true });
    expect(verboseOut).not.toContain("more — use --verbose");
    expect(verboseOut).toContain("/repo/src/4.ts");
  });

  it("strips the repoRoot from occurrence paths", () => {
    const out = renderPretty(
      [diag({ rule: "r", filePath: "/repo/src/deep/x.ts" })],
      { score: 80, label: "Great", partial: false },
      false,
      { repoRoot: "/repo" },
    );
    expect(out).toContain("src/deep/x.ts");
    expect(out).not.toContain("/repo/src/deep/x.ts");
  });

  it("highlights partial-score state in the header", () => {
    const out = renderPretty(
      [diag({ rule: "r" })],
      { score: 70, label: "Needs work", partial: true },
      true,
    );
    expect(out).toContain("partial");
    expect(out).toContain("Needs work");
  });

  it("plain ASCII when color=false; embeds ANSI when color=true", () => {
    const plain = renderPretty([diag({ rule: "r" })], { score: 80, label: "Great", partial: false }, false);
    const coloured = renderPretty([diag({ rule: "r" })], { score: 80, label: "Great", partial: false }, false, { color: true });
    expect(plain).not.toContain("\x1b[");
    expect(coloured).toContain("\x1b[");
  });
});

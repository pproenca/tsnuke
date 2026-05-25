import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@ts-doctor/contracts-effect";
import { renderPretty, renderScoreLine, type RenderScoreResult } from "../main/index.js";
import {
  frozenRenderPretty,
  frozenRenderScoreLine,
  type FrozenDiagnostic,
} from "./legacy-frozen.js";

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

describe("renderScoreLine", () => {
  it("renders n/a when score is null", () => {
    expect(renderScoreLine(null, false)).toBe("Score: n/a");
    // scorePartial is ignored when score is null.
    expect(renderScoreLine(null, true)).toBe("Score: n/a");
  });

  it("renders the exact score line for each band (Great / Needs work / Critical)", () => {
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

  it("appends the partial suffix VERBATIM when scorePartial is true", () => {
    expect(renderScoreLine({ score: 80, label: "Great", partial: true }, true)).toBe(
      "Score: 80/100 — Great (partial — type info unavailable, not comparable)",
    );
  });

  it("uses the scorePartial PARAM, not the score.partial field", () => {
    // score.partial=true but scorePartial=false → no suffix (legacy reads the param).
    expect(renderScoreLine({ score: 80, label: "Great", partial: true }, false)).toBe(
      "Score: 80/100 — Great",
    );
  });
});

describe("renderPretty", () => {
  it("renders header + 'No issues found.' when there are no diagnostics", () => {
    const out = renderPretty([], { score: 100, label: "Great", partial: false }, false);
    expect(out).toBe("Score: 100/100 — Great\n\nNo issues found.");
  });

  it("omits the score header when showScore is false", () => {
    const out = renderPretty([], { score: 100, label: "Great", partial: false }, false, false);
    expect(out).toBe("No issues found.");
  });

  it("groups by category (alphabetical) with the exact per-finding line format + summary", () => {
    const diagnostics = [
      diag({ rule: "z-rule", category: "Zeta", filePath: "/repo/z.ts", line: 9, column: 2, severity: "warning" }),
      diag({ rule: "a-rule", category: "Alpha", filePath: "/repo/a.ts", line: 1, column: 3, severity: "error" }),
    ];
    const out = renderPretty(diagnostics, { score: 50, label: "Needs work", partial: false }, false);
    expect(out).toBe(
      [
        "Score: 50/100 — Needs work",
        "",
        "Alpha:",
        "  /repo/a.ts:1:3  error  a-rule  msg-a-rule",
        "",
        "Zeta:",
        "  /repo/z.ts:9:2  warning  z-rule  msg-z-rule",
        "",
        "1 error(s), 1 warning(s).",
      ].join("\n"),
    );
  });

  it("renders the partial suffix in the pretty header too", () => {
    const out = renderPretty(
      [diag({ rule: "r", category: "A", filePath: "/x.ts", line: 1, column: 1 })],
      { score: 70, label: "Needs work", partial: true },
      true,
    );
    expect(out.startsWith("Score: 70/100 — Needs work (partial — type info unavailable, not comparable)\n")).toBe(true);
  });
});

describe("equivalence vs frozen legacy render", () => {
  const crafted: FrozenDiagnostic[] = [
    { filePath: "/repo/src/z.ts", plugin: "ts-doctor", rule: "z-r", severity: "error", message: "boom", help: "h", line: 12, column: 4, category: "Zeta", tier: "SYN" },
    { filePath: "/repo/src/a.ts", plugin: "ts-doctor", rule: "a-r", severity: "warning", message: "soft", help: "h", line: 2, column: 1, category: "Alpha", tier: "TYP" },
    { filePath: "/repo/src/a2.ts", plugin: "ts-doctor", rule: "a-r2", severity: "error", message: "boom2", help: "h", line: 5, column: 6, category: "Alpha", tier: "SYN" },
  ];
  const ported = crafted as unknown as Diagnostic[];

  const scores: ReadonlyArray<RenderScoreResult | null> = [
    null,
    { score: 100, label: "Great", partial: false },
    { score: 64, label: "Needs work", partial: true },
    { score: 0, label: "Critical", partial: false },
  ];

  it("renderScoreLine matches the frozen oracle across bands x partial", () => {
    for (const s of scores) {
      for (const partial of [false, true]) {
        expect(renderScoreLine(s, partial)).toBe(frozenRenderScoreLine(s, partial));
      }
    }
  });

  it("renderPretty matches the frozen oracle (showScore on/off, partial on/off, empty + populated)", () => {
    for (const s of scores) {
      for (const partial of [false, true]) {
        for (const showScore of [true, false]) {
          for (const diags of [[] as FrozenDiagnostic[], crafted]) {
            expect(renderPretty(diags as unknown as Diagnostic[], s, partial, showScore)).toBe(
              frozenRenderPretty(diags, s, partial, showScore),
            );
          }
        }
      }
    }
    void ported;
  });
});

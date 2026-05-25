import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-angle-bracket-assertion.js";

// Ported VERBATIM from legacy `.../type-assertions/no-angle-bracket-assertion.test.ts`,
// plus position/severity/rule-id assertions and an extra negative.
describe("no-angle-bracket-assertion (SYN)", () => {
  it("flags an angle-bracket cast `<T>x`", () => {
    const diags = runRule(
      rule,
      "declare const y: unknown;\nconst x = <string>y;\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("as T");
    expect(diags[0]!.rule).toBe("no-angle-bracket-assertion");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.tier).toBe("SYN");
    // `<string>y` starts at column 11 of line 2 (`const x = `).
    expect(diags[0]!.line).toBe(2);
    expect(diags[0]!.column).toBe(11);
  });

  it("does not flag the `x as T` form", () => {
    expect(
      runRule(rule, "declare const y: unknown;\nconst x = y as string;\n"),
    ).toHaveLength(0);
  });

  // Negative: plain expression with no cast at all.
  it("does not flag a plain assignment", () => {
    expect(runRule(rule, "const x = 1;\n")).toHaveLength(0);
  });
});

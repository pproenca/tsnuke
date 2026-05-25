import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-unnecessary-template-literal.js";

// Ported VERBATIM from legacy `.../naming-idioms/no-unnecessary-template-literal.test.ts`.
describe("no-unnecessary-template-literal (SYN)", () => {
  it("flags a template literal with no interpolation", () => {
    const diags = runRule(rule, "const s = `hello`;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("no interpolation");
    expect(diags[0]!.rule).toBe("no-unnecessary-template-literal");
  });

  it("does not flag a template literal containing a quote", () => {
    expect(runRule(rule, 'const s = `has "quotes"`;\n')).toHaveLength(0);
  });

  it("does not flag an interpolated template (TemplateExpression node)", () => {
    expect(runRule(rule, "const s = `x${y}`;\n")).toHaveLength(0);
  });

  // Edge (verbatim quirk): a template containing a single quote is left alone.
  it("does not flag a template containing a single quote", () => {
    expect(runRule(rule, "const s = `it's`;\n")).toHaveLength(0);
  });
});

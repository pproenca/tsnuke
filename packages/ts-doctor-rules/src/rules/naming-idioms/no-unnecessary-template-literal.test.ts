import { describe, expect, it } from "vitest";
import { rule } from "./no-unnecessary-template-literal.js";
import { runRule } from "../../test-utils.js";

describe("no-unnecessary-template-literal (SYN)", () => {
  it("flags a template literal with no interpolation", () => {
    const diags = runRule(rule, "const s = `hello`;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("no interpolation");
  });

  it("does not flag a template literal containing a quote", () => {
    expect(runRule(rule, 'const s = `has "quotes"`;\n')).toHaveLength(0);
  });

  it("does not flag an interpolated template (TemplateExpression node)", () => {
    expect(runRule(rule, "const s = `x${y}`;\n")).toHaveLength(0);
  });
});

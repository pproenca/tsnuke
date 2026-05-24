import { describe, expect, it } from "vitest";
import { rule } from "./triple-equals.js";
import { runRule } from "../../test-utils.js";

describe("triple-equals (SYN)", () => {
  it("flags `==` between two non-nullish operands", () => {
    const diags = runRule(rule, "const a = 1;\nconst b = '1';\nconst x = a == b;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("triple-equals");
  });

  it("flags `!=` between two non-nullish operands", () => {
    expect(
      runRule(rule, "declare const a: number;\nconst x = a != 0;\n"),
    ).toHaveLength(1);
  });

  it("allows `x == null` (the sanctioned null/undefined idiom)", () => {
    expect(
      runRule(rule, "declare const a: unknown;\nconst x = a == null;\n"),
    ).toHaveLength(0);
  });

  it("allows `x != undefined`", () => {
    expect(
      runRule(rule, "declare const a: unknown;\nconst x = a != undefined;\n"),
    ).toHaveLength(0);
  });

  it("does not flag `===` / `!==`", () => {
    expect(
      runRule(rule, "const a = 1;\nconst x = a === 1;\nconst y = a !== 2;\n"),
    ).toHaveLength(0);
  });
});

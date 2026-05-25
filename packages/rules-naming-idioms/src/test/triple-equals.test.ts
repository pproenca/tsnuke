import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/triple-equals.js";

// Ported VERBATIM from legacy `.../naming-idioms/triple-equals.test.ts`, plus the
// documented RULE-026 broken-auto-fix edge.
describe("triple-equals (SYN)", () => {
  it("flags `==` between two non-nullish operands", () => {
    const diags = runRule(rule, "const a = 1;\nconst b = '1';\nconst x = a == b;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("triple-equals");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.message).toContain("===");
  });

  it("flags `!=` between two non-nullish operands", () => {
    const diags = runRule(rule, "declare const a: number;\nconst x = a != 0;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("!==");
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

  // Extra coverage of the allowed `== null` idiom in both directions / both operators.
  it("allows `null == x` (nullish on the left) and `x != null`", () => {
    expect(
      runRule(rule, "declare const a: unknown;\nconst x = null == a;\n"),
    ).toHaveLength(0);
    expect(
      runRule(rule, "declare const a: unknown;\nconst y = a != null;\n"),
    ).toHaveLength(0);
  });

  // RULE-026 (broken auto-fix): declares fixKind:"auto-fix" but attaches NO fix
  // payload. The replacement text is in the MESSAGE only; no `fix.edits` exist.
  it("declares fixKind auto-fix but emits NO fix payload (RULE-026)", () => {
    expect(rule.fixKind).toBe("auto-fix");
    const diags = runRule(rule, "const a = 1;\nconst x = a == 2;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.fix).toBeUndefined();
  });
});

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

  // P4 (real codemod, supersedes RULE-026): the rule now emits a `fix.edits`
  // payload that replaces the loose operator (`==` / `!=`) with its strict
  // counterpart (`===` / `!==`) at the exact source position. `--fix` applies
  // this mechanically. Previously the meta claimed `auto-fix` but no edits
  // were attached, so the agent-JSON `fixSummary.autoFixable` counted as 0.
  it("emits a fix payload that swaps `==` for `===` at the operator token", () => {
    expect(rule.fixKind).toBe("auto-fix");
    const source = "const a = 1;\nconst x = a == 2;\n";
    const diags = runRule(rule, source);
    expect(diags).toHaveLength(1);
    const fix = diags[0]!.fix;
    expect(fix).toBeDefined();
    expect(fix!.kind).toBe("auto-fix");
    expect(fix!.edits).toHaveLength(1);
    const edit = fix!.edits[0]!;
    expect(source.slice(edit.start, edit.end)).toBe("==");
    expect(edit.replacement).toBe("===");
  });

  it("emits a `!==` fix for `!=`", () => {
    const source = "const a = 1;\nconst x = a != 2;\n";
    const diags = runRule(rule, source);
    expect(diags).toHaveLength(1);
    const fix = diags[0]!.fix;
    expect(fix).toBeDefined();
    expect(fix!.edits[0]!.replacement).toBe("!==");
  });
});

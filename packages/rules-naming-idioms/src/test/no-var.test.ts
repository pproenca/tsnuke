import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-var.js";

// Ported VERBATIM from legacy `.../naming-idioms/no-var.test.ts`.
describe("no-var (SYN)", () => {
  it("flags a `var` declaration", () => {
    const diags = runRule(rule, "var x = 1;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-var");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("flags `var` in a for-loop initializer", () => {
    expect(runRule(rule, "for (var i = 0; i < 3; i++) {}\n")).toHaveLength(1);
  });

  it("does NOT flag `let` or `const`", () => {
    expect(runRule(rule, "let y = 2;\nconst z = 3;\n")).toHaveLength(0);
  });

  // RULE-026 (broken auto-fix): declares fixKind:"auto-fix" but attaches NO fix
  // payload. Preserve verbatim — the diagnostic fires, but carries no `fix`.
  it("declares fixKind auto-fix but emits NO fix payload (RULE-026)", () => {
    expect(rule.fixKind).toBe("auto-fix");
    const diags = runRule(rule, "var x = 1;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.fix).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/any-density-budget.js";

// Ported VERBATIM from legacy `.../type-safety/any-density-budget.test.ts`, then
// AUGMENTED with the exclusive-threshold boundary (RULE-006: >5 fires, exactly 5
// allowed) and the "fires once per file regardless of count" invariant.
describe("SYN rule — any-density-budget (RULE-006)", () => {
  it("flags a file whose `any` count exceeds the budget (once, at file start)", () => {
    const code =
      "let a: any;\nlet b: any;\nlet c: any;\nlet d: any;\nlet e: any;\nlet f: any;\n";
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("any-density-budget");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.line).toBe(1);
    expect(d.column).toBe(1);
    expect(d.message).toContain("6");
  });

  it("does not flag a file at or under the budget", () => {
    const code = "let a: any;\nlet b: any;\nlet c: any;\nlet d: any;\nlet e: any;\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  // Boundary: exactly 5 `any` keywords → threshold is EXCLUSIVE, so no fire.
  it("does NOT fire at exactly the threshold (5 `any` → allowed)", () => {
    const code = "let a: any;\nlet b: any;\nlet c: any;\nlet d: any;\nlet e: any;\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  // Boundary: 6 `any` keywords → just over the threshold, fires.
  it("fires at exactly one over the threshold (6 `any`)", () => {
    const code =
      "let a: any;\nlet b: any;\nlet c: any;\nlet d: any;\nlet e: any;\nlet f: any;\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  // Invariant: fires exactly ONCE per file regardless of how far over the budget.
  it("fires exactly once per file regardless of count (20 `any`)", () => {
    const line = "let x: any;\n";
    const code = line.repeat(20);
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("20");
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(1);
  });

  // A file with no `any` at all is silent.
  it("does not flag a file with no `any`", () => {
    expect(runRule(rule, "const n: number = 1;\nconst s: string = '';\n")).toHaveLength(0);
  });
});

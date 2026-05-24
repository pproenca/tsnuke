import { describe, expect, it } from "vitest";
import { rule } from "./any-density-budget.js";
import { runRule } from "../../test-utils.js";

describe("SYN rule — any-density-budget", () => {
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
});

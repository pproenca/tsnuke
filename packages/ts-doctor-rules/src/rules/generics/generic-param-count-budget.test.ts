import { describe, expect, it } from "vitest";
import { rule } from "./generic-param-count-budget.js";
import { runRule } from "../../test-utils.js";

describe("SYN rule — generic-param-count-budget", () => {
  it("flags a function with more type parameters than the budget", () => {
    const diags = runRule(rule, "function f<A, B, C, D, E>() {}\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("generic-param-count-budget");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.message).toContain("5");
  });

  it("flags an over-budget interface declaration", () => {
    expect(
      runRule(rule, "interface I<A, B, C, D, E> { x: A; }\n"),
    ).toHaveLength(1);
  });

  it("does not flag a declaration at or under the budget", () => {
    expect(runRule(rule, "function f<A, B>() {}\n")).toHaveLength(0);
  });
});

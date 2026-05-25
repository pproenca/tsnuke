import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/generic-param-count-budget.js";

describe("SYN rule — generic-param-count-budget (RULE-007)", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

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

  // --- Added characterization detail: full diagnostic shape ---

  it("reports the full diagnostic (tier/severity/category/message/help/position)", () => {
    const diags = runRule(rule, "function f<A, B, C, D, E>() {}\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("generic-param-count-budget");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.category).toBe("Generics & Type-Level Complexity");
    expect(d.plugin).toBe("tsnuke");
    expect(d.message).toBe(
      "Too many type parameters: 5 declared (budget is 4).",
    );
    expect(d.help).toBe(
      "A declaration with many generic parameters is hard to call and reason about. Consider an options object, a shared base type, or splitting the declaration.",
    );
    // Position pins to the declaration start: line 1, col 1.
    expect(d.line).toBe(1);
    expect(d.column).toBe(1);
  });

  // --- Added boundary cases: exactly-4 (no fire) vs 5 (fire) — exclusive `>` budget ---

  it("does NOT fire at exactly 4 type parameters (budget is exclusive `>`)", () => {
    expect(runRule(rule, "function f<A, B, C, D>() {}\n")).toHaveLength(0);
  });

  it("fires at 5 type parameters (one over the budget)", () => {
    const diags = runRule(rule, "function f<A, B, C, D, E>() {}\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe(
      "Too many type parameters: 5 declared (budget is 4).",
    );
  });

  it("does NOT fire on a declaration with no type parameters", () => {
    expect(runRule(rule, "function f() {}\n")).toHaveLength(0);
  });

  // --- Added coverage: all 5 named declaration kinds fire ---

  it("fires on every covered declaration kind (function/method/class/interface/type alias)", () => {
    expect(runRule(rule, "function f<A, B, C, D, E>() {}\n")).toHaveLength(1);
    expect(
      runRule(rule, "class C { m<A, B, C, D, E>() {} }\n"),
    ).toHaveLength(1);
    expect(runRule(rule, "class C<A, B, C, D, E> {}\n")).toHaveLength(1);
    expect(
      runRule(rule, "interface I<A, B, C, D, E> { x: A; }\n"),
    ).toHaveLength(1);
    expect(runRule(rule, "type T<A, B, C, D, E> = A;\n")).toHaveLength(1);
  });

  // --- Added scoping: arrow functions and function expressions are NOT covered (RULE-007) ---

  it("does NOT fire on an arrow function with > 4 type parameters (not a covered kind)", () => {
    expect(
      runRule(rule, "const f = <A, B, C, D, E>() => {};\n"),
    ).toHaveLength(0);
  });

  it("does NOT fire on a function expression with > 4 type parameters (not a covered kind)", () => {
    expect(
      runRule(rule, "const f = function <A, B, C, D, E>() {};\n"),
    ).toHaveLength(0);
  });
});

import { describe, it, expect } from "vitest";
import { runRule } from "../../test-utils.js";
import { rule } from "./no-explicit-any.js";

describe("SYN rule — no-explicit-any", () => {
  it("flags an explicit `any` type annotation (BC-10: tier SYN)", () => {
    const code = "let value: any;\n";
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-explicit-any");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.line).toBe(1);
  });

  it("flags `any` in parameter and return positions", () => {
    const code = "function f(a: any): any { return a; }\n";
    expect(runRule(rule, code).length).toBeGreaterThanOrEqual(2);
  });

  it("does not flag well-typed code", () => {
    const code = "let value: unknown;\nconst n: number = 1;\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });
});

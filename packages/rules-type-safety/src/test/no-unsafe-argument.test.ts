import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-unsafe-argument.js";

// Ported VERBATIM from legacy `.../type-safety/no-unsafe-argument.test.ts`, plus a
// negative for the `no-unsafe-*` family (a safe typed argument is NOT flagged).
describe("no-unsafe-argument (TYP / BC-10)", () => {
  it("flags an `any` argument passed into a typed parameter under a live checker", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare function f(x: number): void;\ndeclare const a: any;\nf(a);\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unsafe-argument");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("error");
  });

  it("does not flag an `any` argument into an `any` parameter", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare function f(x: any): void;\ndeclare const a: any;\nf(a);\n",
    );
    expect(diags).toHaveLength(0);
  });

  it("does not flag a precisely-typed argument", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare function f(x: number): void;\nf(1);\n",
    );
    expect(diags).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(
        rule,
        "declare function f(x: number): void;\ndeclare const a: any;\nf(a);\n",
      ),
    ).toHaveLength(0);
  });

  // Negative: an `any` argument into an `unknown` parameter is safe (unknown accepts anything).
  it("does not flag an `any` argument into an `unknown` parameter", () => {
    expect(
      runTypeAwareRule(
        rule,
        "declare function f(x: unknown): void;\ndeclare const a: any;\nf(a);\n",
      ),
    ).toHaveLength(0);
  });

  // Negative: a fully typed call with a typed variable is not flagged.
  it("does not flag a typed variable passed into a matching parameter", () => {
    expect(
      runTypeAwareRule(
        rule,
        "declare function f(x: number): void;\ndeclare const n: number;\nf(n);\n",
      ),
    ).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { rule } from "./no-unsafe-argument.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

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
});

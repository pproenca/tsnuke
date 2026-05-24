import { describe, expect, it } from "vitest";
import { rule } from "./no-unsafe-return.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("no-unsafe-return (TYP / BC-10)", () => {
  it("flags returning an `any`-typed value under a live checker", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare const x: any;\nfunction f() { return x; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unsafe-return");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag returning a precisely-typed value", () => {
    const diags = runTypeAwareRule(rule, "function f() { return 1; }\n");
    expect(diags).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(rule, "declare const x: any;\nfunction f() { return x; }\n"),
    ).toHaveLength(0);
  });
});

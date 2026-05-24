import { describe, expect, it } from "vitest";
import { rule } from "./prefer-promise-reject-errors.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("prefer-promise-reject-errors (TYP)", () => {
  it("flags rejecting with a string primitive", () => {
    const diags = runTypeAwareRule(
      rule,
      'function f() { return Promise.reject("boom"); }\n',
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("TYP");
  });

  it("does not flag rejecting with an Error", () => {
    expect(
      runTypeAwareRule(
        rule,
        'function f() { return Promise.reject(new Error("x")); }\n',
      ),
    ).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(rule, 'function f() { return Promise.reject("boom"); }\n'),
    ).toHaveLength(0);
  });
});

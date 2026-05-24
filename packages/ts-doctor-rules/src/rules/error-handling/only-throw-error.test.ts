import { describe, expect, it } from "vitest";
import { rule } from "./only-throw-error.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("only-throw-error (TYP)", () => {
  it("flags throwing a string", () => {
    const diags = runTypeAwareRule(rule, 'throw "boom";\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("TYP");
  });

  it("does not flag throwing an Error", () => {
    expect(runTypeAwareRule(rule, 'throw new Error("x");\n')).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(runRule(rule, 'throw "boom";\n')).toHaveLength(0);
  });
});

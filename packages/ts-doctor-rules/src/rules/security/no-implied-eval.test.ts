import { describe, expect, it } from "vitest";
import { rule } from "./no-implied-eval.js";
import { runRule } from "../../test-utils.js";

describe("no-implied-eval (SYN)", () => {
  it("flags a string-argument setTimeout", () => {
    const diags = runRule(rule, 'setTimeout("doStuff()", 100);\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("does not flag a function-argument setTimeout", () => {
    expect(runRule(rule, "setTimeout(() => doStuff(), 100);\n")).toHaveLength(0);
  });
});

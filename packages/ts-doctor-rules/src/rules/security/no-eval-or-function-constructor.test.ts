import { describe, expect, it } from "vitest";
import { rule } from "./no-eval-or-function-constructor.js";
import { runRule } from "../../test-utils.js";

describe("no-eval-or-function-constructor (SYN)", () => {
  it("flags a call to eval", () => {
    const diags = runRule(rule, 'eval("x");\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("flags `new Function(...)`", () => {
    const diags = runRule(rule, 'const f = new Function("return 1");\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("does not flag JSON.parse", () => {
    expect(runRule(rule, 'JSON.parse("{}");\n')).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { rule } from "./no-mutable-exports.js";
import { runRule } from "../../test-utils.js";

describe("no-mutable-exports (SYN)", () => {
  it("flags `export let`", () => {
    const diags = runRule(rule, "export let x = 1;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-mutable-exports");
  });

  it("flags `export var`", () => {
    const diags = runRule(rule, "export var y = 2;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-mutable-exports");
  });

  it("allows `export const`", () => {
    expect(runRule(rule, "export const z = 3;\n")).toHaveLength(0);
  });
});

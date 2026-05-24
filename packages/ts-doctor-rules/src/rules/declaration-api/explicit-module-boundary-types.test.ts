import { describe, expect, it } from "vitest";
import { rule } from "./explicit-module-boundary-types.js";
import { runRule } from "../../test-utils.js";

describe("explicit-module-boundary-types (SYN)", () => {
  it("flags an exported function with no return type", () => {
    const diags = runRule(rule, "export function f(x: number) { return x + 1; }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("explicit-module-boundary-types");
  });

  it("allows an exported function with an explicit return type", () => {
    expect(
      runRule(rule, "export function f(x: number): number { return x + 1; }\n"),
    ).toHaveLength(0);
  });

  it("ignores a non-exported function with no return type", () => {
    expect(runRule(rule, "function g(x: number) { return x; }\n")).toHaveLength(
      0,
    );
  });
});

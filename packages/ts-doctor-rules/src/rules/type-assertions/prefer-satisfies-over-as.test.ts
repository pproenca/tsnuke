import { describe, expect, it } from "vitest";
import { rule } from "./prefer-satisfies-over-as.js";
import { runRule } from "../../test-utils.js";

describe("prefer-satisfies-over-as (SYN)", () => {
  it("flags an object literal `as` a named type", () => {
    const diags = runRule(rule, "const cfg = { a: 1 } as Config;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("satisfies");
  });

  it("flags an array literal `as` a named type", () => {
    const diags = runRule(rule, "const xs = [1, 2] as ReadonlyArray<number>;\n");
    expect(diags).toHaveLength(1);
  });

  it("does not flag `as const`", () => {
    expect(runRule(rule, "const cfg = { a: 1 } as const;\n")).toHaveLength(0);
  });

  it("does not flag a non-literal expression", () => {
    expect(
      runRule(rule, "declare const x: unknown;\nconst v = x as Config;\n"),
    ).toHaveLength(0);
  });
});

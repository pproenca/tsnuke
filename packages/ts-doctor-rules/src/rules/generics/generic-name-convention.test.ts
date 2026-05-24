import { describe, expect, it } from "vitest";
import { rule } from "./generic-name-convention.js";
import { runRule } from "../../test-utils.js";

describe("generic-name-convention (SYN)", () => {
  it("flags a lowercase type parameter name", () => {
    const diags = runRule(rule, "function f<t>(x: t) { return x; }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("generic-name-convention");
  });

  it("allows a PascalCase type parameter name", () => {
    expect(runRule(rule, "function f<T>(x: T) { return x; }\n")).toHaveLength(0);
  });
});

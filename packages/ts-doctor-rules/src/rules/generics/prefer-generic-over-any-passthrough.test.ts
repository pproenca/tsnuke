import { describe, expect, it } from "vitest";
import { rule } from "./prefer-generic-over-any-passthrough.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("prefer-generic-over-any-passthrough (TYP)", () => {
  it("flags an identity passthrough `(x: any): any`", () => {
    const diags = runTypeAwareRule(rule, "function id(x: any): any { return x; }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("TYP");
  });

  it("flags an arrow with an inferred `any` return", () => {
    expect(runTypeAwareRule(rule, "const wrap = (x: any) => x;\n")).toHaveLength(1);
  });

  it("flags a derivation that returns from the any param", () => {
    expect(
      runTypeAwareRule(rule, "function pick(o: any): any { return o.value; }\n"),
    ).toHaveLength(1);
  });

  it("does NOT flag an already-generic function", () => {
    expect(
      runTypeAwareRule(rule, "function id2<T>(x: T): T { return x; }\n"),
    ).toHaveLength(0);
  });

  it("does NOT flag an `any` param with a non-any return", () => {
    expect(
      runTypeAwareRule(rule, "function log(x: any): void { console.log(x); }\n"),
    ).toHaveLength(0);
  });

  it("emits nothing without a checker (gated)", () => {
    expect(runRule(rule, "function id(x: any): any { return x; }\n")).toHaveLength(0);
  });
});

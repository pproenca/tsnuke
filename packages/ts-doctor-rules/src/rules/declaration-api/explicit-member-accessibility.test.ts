import { describe, expect, it } from "vitest";
import { rule } from "./explicit-member-accessibility.js";
import { runRule } from "../../test-utils.js";

describe("explicit-member-accessibility (SYN)", () => {
  it("flags a class property with no access modifier", () => {
    expect(runRule(rule, "class C { x = 1; }\n")).toHaveLength(1);
  });

  it("flags a class method with no access modifier", () => {
    expect(runRule(rule, "class C { foo() {} }\n")).toHaveLength(1);
  });

  it("does NOT flag members with an explicit modifier", () => {
    expect(
      runRule(rule, "class C { private x = 1; public foo() {} protected bar() {} }\n"),
    ).toHaveLength(0);
  });

  it("does NOT flag object-literal methods (can't take modifiers)", () => {
    expect(runRule(rule, "const o = { foo() {} };\n")).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { rule } from "./no-wrapper-object-types.js";
import { runRule } from "../../test-utils.js";

describe("no-wrapper-object-types (SYN)", () => {
  it("flags a `Number` wrapper type annotation", () => {
    const diags = runRule(rule, "let x: Number;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-wrapper-object-types");
  });

  it("flags the `Function` type", () => {
    expect(runRule(rule, "let f: Function;\n")).toHaveLength(1);
  });

  it("flags the `{}` empty object type", () => {
    expect(runRule(rule, "let o: {};\n")).toHaveLength(1);
  });

  it("flags `new String('x')` wrapper construction", () => {
    expect(runRule(rule, "const s = new String('x');\n")).toHaveLength(1);
  });

  it("allows lowercase primitive types", () => {
    expect(
      runRule(rule, "let a: string;\nlet b: number;\nlet c: boolean;\n"),
    ).toHaveLength(0);
  });

  it("allows calling `String(x)` as a coercion function (no `new`)", () => {
    expect(runRule(rule, "const s = String(42);\n")).toHaveLength(0);
  });

  it("allows an object type literal with members", () => {
    expect(runRule(rule, "let o: { id: number };\n")).toHaveLength(0);
  });

  it("does not flag a user generic that shadows a banned name with type args", () => {
    expect(
      runRule(rule, "type Wrap<T> = { v: T };\ndeclare const x: Wrap<number>;\n"),
    ).toHaveLength(0);
  });
});

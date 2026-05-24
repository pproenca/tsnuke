import { describe, expect, it } from "vitest";
import { rule } from "./consistent-type-definitions.js";
import { runRule } from "../../test-utils.js";

describe("consistent-type-definitions (SYN)", () => {
  it("flags `type X = { ... }` object-shape alias", () => {
    const diags = runRule(rule, "type User = { id: number; name: string };\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("consistent-type-definitions");
  });

  it("does not flag a union alias", () => {
    expect(runRule(rule, "type Dir = 'n' | 's' | 'e' | 'w';\n")).toHaveLength(0);
  });

  it("does not flag an intersection alias", () => {
    expect(
      runRule(rule, "type A = { a: number };\ntype B = A & { b: string };\n"),
    ).toHaveLength(1); // only the `type A = {...}` object literal, not the intersection
  });

  it("does not flag a function-type alias", () => {
    expect(runRule(rule, "type Fn = (x: number) => string;\n")).toHaveLength(0);
  });

  it("does not flag a mapped-type alias", () => {
    expect(
      runRule(rule, "type Flags<T> = { [K in keyof T]: boolean };\n"),
    ).toHaveLength(0);
  });

  it("does not flag an empty-object alias", () => {
    expect(runRule(rule, "type Empty = {};\n")).toHaveLength(0);
  });

  it("does not flag an existing interface", () => {
    expect(runRule(rule, "interface User { id: number }\n")).toHaveLength(0);
  });
});

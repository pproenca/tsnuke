import { describe, expect, it } from "vitest";
import { rule } from "./prefer-discriminated-union.js";
import { runRule } from "../../test-utils.js";

describe("prefer-discriminated-union (SYN)", () => {
  it("flags a typeof if/else-if chain on the same value", () => {
    const code =
      "declare const x: string | number;\n" +
      "function f() {\n" +
      '  if (typeof x === "string") { return x.length; }\n' +
      '  else if (typeof x === "number") { return x + 1; }\n' +
      "  return 0;\n}\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags an instanceof chain on the same value", () => {
    const code =
      "class A {}\nclass B {}\ndeclare const o: A | B;\n" +
      "function h() {\n" +
      "  if (o instanceof A) { return 1; }\n" +
      "  else if (o instanceof B) { return 2; }\n" +
      "  return 0;\n}\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags `switch (typeof x)`", () => {
    const code =
      "declare const v: unknown;\n" +
      "function g() { switch (typeof v) { case \"string\": return 1; default: return 0; } }\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag a non-type-test if/else-if chain", () => {
    const code =
      "function n(a: number, b: number) {\n" +
      "  if (a > 0) { return 1; } else if (b > 0) { return 2; }\n" +
      "  return 0;\n}\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag a single typeof branch", () => {
    const code =
      'declare const x: string;\nfunction s() { if (typeof x === "string") { return 1; } return 0; }\n';
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag a chain mixing a type-test with other logic", () => {
    const code =
      "declare const x: string | number;\ndeclare const y: number;\n" +
      'function m() { if (typeof x === "string") { return 1; } else if (y > 0) { return 2; } return 0; }\n';
    expect(runRule(rule, code)).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { rule } from "./no-cast-after-guard.js";
import { runRule } from "../../test-utils.js";

describe("no-cast-after-guard (SYN)", () => {
  it("flags `typeof x === 'object' ? (x as T) : null`", () => {
    const code =
      "interface S { id: string }\ndeclare const value: unknown;\n" +
      "const r = value && typeof value === \"object\" ? (value as S) : null;\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("flags `Array.isArray(v) ? (v as T[]) : []`", () => {
    const code = "declare const v: unknown;\nconst r = Array.isArray(v) ? (v as number[]) : [];\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("does NOT flag a cast in a non-type-check ternary", () => {
    const code = "declare const x: number;\nconst r = x > 0 ? (x as 1) : (x as 2);\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does NOT flag a guard with no cast", () => {
    const code = 'declare const x: unknown;\nconst r = typeof x === "string" ? x : null;\n';
    expect(runRule(rule, code)).toHaveLength(0);
  });
});

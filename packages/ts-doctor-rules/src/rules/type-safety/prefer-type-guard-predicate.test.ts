import { describe, expect, it } from "vitest";
import { rule } from "./prefer-type-guard-predicate.js";
import { runRule } from "../../test-utils.js";

describe("prefer-type-guard-predicate (SYN)", () => {
  it("flags a boolean function that guards via typeof", () => {
    const diags = runRule(
      rule,
      'function isString(v: unknown): boolean { return typeof v === "string"; }\n',
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("type predicate");
  });

  it("flags a boolean arrow that guards via instanceof", () => {
    expect(
      runRule(rule, "const isErr = (v: unknown): boolean => v instanceof Error;\n"),
    ).toHaveLength(1);
  });

  it("does NOT flag a function already declared as a type predicate", () => {
    expect(
      runRule(
        rule,
        'function isString(v: unknown): v is string { return typeof v === "string"; }\n',
      ),
    ).toHaveLength(0);
  });

  it("does NOT flag a boolean function that isn't a type guard", () => {
    expect(
      runRule(rule, "function isBig(n: number): boolean { return n > 10; }\n"),
    ).toHaveLength(0);
  });
});

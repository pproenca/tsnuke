import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/prefer-discriminated-union.js";

describe("prefer-discriminated-union (SYN / RULE-016)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

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
      'function g() { switch (typeof v) { case "string": return 1; default: return 0; } }\n';
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

  // --- Added edge cases: RULE-016 ≥2-arm + same-discriminant threshold ---

  it("RULE-016: a single `if` (no else-if) never fires (chain length < 2)", () => {
    const code =
      'declare const x: string | number;\nfunction s() { if (typeof x === "string") { return 1; } else { return 0; } }\n';
    // The else is not an if, so the chain has exactly one type-test arm.
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("RULE-016: a chain of type-tests on DIFFERENT discriminants aborts", () => {
    const code =
      "declare const x: string | number;\ndeclare const y: string | number;\n" +
      'function m() { if (typeof x === "string") { return 1; } else if (typeof y === "number") { return 2; } return 0; }\n';
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("RULE-016: a chain whose first arm is NOT a type-test aborts", () => {
    const code =
      "declare const x: string | number;\ndeclare const y: number;\n" +
      'function m() { if (y > 0) { return 1; } else if (typeof x === "string") { return 2; } return 0; }\n';
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("fires exactly once at the HEAD of a nested else-if chain (no double-count)", () => {
    const code =
      "declare const x: string | number | boolean;\n" +
      "function f() {\n" +
      '  if (typeof x === "string") { return 1; }\n' +
      '  else if (typeof x === "number") { return 2; }\n' +
      '  else if (typeof x === "boolean") { return 3; }\n' +
      "  return 0;\n}\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  it("carries the verbatim message/help + meta + rule-id", () => {
    const code =
      "declare const x: string | number;\n" +
      'function f() { if (typeof x === "string") { return 1; } else if (typeof x === "number") { return 2; } return 0; }\n';
    const diags = runRule(rule, code);
    expect(diags[0]!.rule).toBe("prefer-discriminated-union");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.message).toBe(
      "Manual type-discrimination by `typeof`/`instanceof`. Model this as a discriminated union and `switch` on a `kind` tag.",
    );
    expect(diags[0]!.help).toBe(
      "A discriminated union moves variant selection into the type system and gives you compiler-checked exhaustiveness.",
    );
    expect(diags[0]!.category).toBe("Exhaustiveness & Narrowing");
    expect(diags[0]!.tier).toBe("SYN");
  });
});

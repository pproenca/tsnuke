import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-cast-after-guard.js";

// Ported VERBATIM from legacy `.../type-assertions/no-cast-after-guard.test.ts`,
// plus metadata + an `instanceof`/`in` edge and a negative.
describe("no-cast-after-guard (SYN)", () => {
  it("flags `typeof x === 'object' ? (x as T) : null`", () => {
    const code =
      "interface S { id: string }\ndeclare const value: unknown;\n" +
      "const r = value && typeof value === \"object\" ? (value as S) : null;\n";
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-cast-after-guard");
    expect(diags[0]!.severity).toBe("warning");
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

  // Edge: an `instanceof` type-check followed by a cast of the same value.
  it("flags `v instanceof Error ? (v as Error) : null`", () => {
    const code =
      "declare const v: unknown;\nconst r = v instanceof Error ? (v as Error) : null;\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  // Edge: an `in` type-check followed by a cast of the same value.
  it("flags `'k' in v ? (v as { k: number }) : null`", () => {
    const code =
      "declare const v: object;\nconst r = 'k' in v ? (v as { k: number }) : null;\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  // Negative: type-check on one value but cast a DIFFERENT identifier.
  it("does NOT flag when the cast value differs from the checked value", () => {
    const code =
      "declare const x: unknown;\ndeclare const y: unknown;\n" +
      'const r = typeof x === "object" ? (y as { id: number }) : null;\n';
    expect(runRule(rule, code)).toHaveLength(0);
  });
});

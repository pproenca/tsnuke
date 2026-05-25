import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-unsafe-object-assertion.js";

// Ported VERBATIM from legacy `.../type-assertions/no-unsafe-object-assertion.test.ts`,
// plus metadata + a parenthesized-type-literal edge.
describe("no-unsafe-object-assertion (SYN)", () => {
  it("flags asserting an inline shape (union) onto a value", () => {
    const code =
      "declare const error: unknown;\n" +
      "const r = error as { exitCode?: number } | null | undefined;\n";
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unsafe-object-assertion");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("flags `value as Record<...>`", () => {
    expect(
      runRule(rule, "declare const x: unknown;\nconst r = x as Record<string, number>;\n"),
    ).toHaveLength(1);
  });

  it("does NOT flag a literal cast (that's prefer-satisfies-over-as)", () => {
    expect(runRule(rule, "const cfg = { a: 1 } as { a: number };\n")).toHaveLength(0);
  });

  it("does NOT flag asserting to a named type", () => {
    expect(
      runRule(rule, "declare const x: unknown;\nconst r = x as MyType;\n"),
    ).toHaveLength(0);
  });

  // Edge: a parenthesized inline type literal is still a structural shape.
  it("flags `x as ({ k: number })`", () => {
    expect(
      runRule(rule, "declare const x: unknown;\nconst r = x as ({ k: number });\n"),
    ).toHaveLength(1);
  });

  // Negative: an array-literal value cast is skipped (literal-value path).
  it("does NOT flag an array-literal value cast", () => {
    expect(runRule(rule, "const r = [1, 2] as { length: number };\n")).toHaveLength(0);
  });
});

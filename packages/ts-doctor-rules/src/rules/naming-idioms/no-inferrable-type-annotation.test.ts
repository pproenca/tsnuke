import { describe, expect, it } from "vitest";
import { rule } from "./no-inferrable-type-annotation.js";
import { runRule } from "../../test-utils.js";

describe("no-inferrable-type-annotation (SYN)", () => {
  it("flags `const n: number = 5`", () => {
    const diags = runRule(rule, "const n: number = 5;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-inferrable-type-annotation");
  });

  it("flags `const s: string = \"x\"`", () => {
    expect(runRule(rule, 'const s: string = "x";\n')).toHaveLength(1);
  });

  it("flags `let b: boolean = true`", () => {
    expect(runRule(rule, "let b: boolean = true;\n")).toHaveLength(1);
  });

  it("allows the same declaration without an annotation", () => {
    expect(runRule(rule, "const n = 5;\n")).toHaveLength(0);
  });

  it("allows a literal-union annotation that narrows the inferred type", () => {
    // `: 'a' | 'b'` is a meaningful annotation, not the `string` keyword.
    expect(
      runRule(rule, "const s: 'a' | 'b' = 'a';\n"),
    ).toHaveLength(0);
  });

  it("does not flag when the annotation and literal kind differ", () => {
    // unusual but valid-shaped: annotation present, initializer not a matching literal
    expect(
      runRule(rule, "declare const other: number;\nconst n: number = other;\n"),
    ).toHaveLength(0);
  });
});

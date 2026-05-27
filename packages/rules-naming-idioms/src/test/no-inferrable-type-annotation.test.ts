import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-inferrable-type-annotation.js";

// Ported VERBATIM from legacy `.../naming-idioms/no-inferrable-type-annotation.test.ts`.
describe("no-inferrable-type-annotation (SYN)", () => {
  it("flags `const n: number = 5`", () => {
    const diags = runRule(rule, "const n: number = 5;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-inferrable-type-annotation");
    expect(diags[0]!.message).toContain("number");
    // 1-based position at the TYPE annotation (`number`, col 10 on line 1).
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(10);
  });

  it('flags `const s: string = "x"`', () => {
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
    expect(runRule(rule, "const s: 'a' | 'b' = 'a';\n")).toHaveLength(0);
  });

  it("does not flag when the annotation and literal kind differ", () => {
    // unusual but valid-shaped: annotation present, initializer not a matching literal
    expect(
      runRule(rule, "declare const other: number;\nconst n: number = other;\n"),
    ).toHaveLength(0);
  });

  // P4 (real codemod, supersedes RULE-026): emits a `fix.edits` payload that
  // deletes the `: <type>` span.
  it("emits a fix payload that deletes the redundant `: number` annotation", () => {
    expect(rule.fixKind).toBe("auto-fix");
    const source = "const n: number = 5;\n";
    const diags = runRule(rule, source);
    expect(diags).toHaveLength(1);
    const fix = diags[0]!.fix;
    expect(fix).toBeDefined();
    expect(fix!.kind).toBe("auto-fix");
    expect(fix!.edits).toHaveLength(1);
    const edit = fix!.edits[0]!;
    expect(source.slice(edit.start, edit.end)).toBe(": number");
    expect(edit.replacement).toBe("");
    // Verify the splice produces the expected code
    const after = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
    expect(after).toBe("const n = 5;\n");
  });
});

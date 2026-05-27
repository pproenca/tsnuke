import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-var.js";

// Ported VERBATIM from legacy `.../naming-idioms/no-var.test.ts`.
describe("no-var (SYN)", () => {
  it("flags a `var` declaration", () => {
    const diags = runRule(rule, "var x = 1;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-var");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("flags `var` in a for-loop initializer", () => {
    expect(runRule(rule, "for (var i = 0; i < 3; i++) {}\n")).toHaveLength(1);
  });

  it("does NOT flag `let` or `const`", () => {
    expect(runRule(rule, "let y = 2;\nconst z = 3;\n")).toHaveLength(0);
  });

  // P4 (real codemod, supersedes RULE-026): emits a `fix.edits` payload that
  // replaces the `var` keyword (exactly 3 chars at `start`) with `let`. `let`
  // is the SAFE conservative choice; agents downgrade `let` → `const` on a
  // second pass when they can prove the binding isn't reassigned. Previously
  // the meta claimed `auto-fix` but no edits were attached.
  it("emits a fix payload that replaces `var` with `let`", () => {
    expect(rule.fixKind).toBe("auto-fix");
    const source = "var x = 1;\n";
    const diags = runRule(rule, source);
    expect(diags).toHaveLength(1);
    const fix = diags[0]!.fix;
    expect(fix).toBeDefined();
    expect(fix!.kind).toBe("auto-fix");
    expect(fix!.edits).toHaveLength(1);
    const edit = fix!.edits[0]!;
    expect(source.slice(edit.start, edit.end)).toBe("var");
    expect(edit.replacement).toBe("let");
  });
});

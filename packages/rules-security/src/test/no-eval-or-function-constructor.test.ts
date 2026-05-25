import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-eval-or-function-constructor.js";

describe("no-eval-or-function-constructor (SYN)", () => {
  // --- Ported legacy vectors (the equivalence spec) -------------------------
  it("flags a call to eval", () => {
    const diags = runRule(rule, 'eval("x");\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("flags `new Function(...)`", () => {
    const diags = runRule(rule, 'const f = new Function("return 1");\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("does not flag JSON.parse", () => {
    expect(runRule(rule, 'JSON.parse("{}");\n')).toHaveLength(0);
  });

  // --- Added: shape / position / message equivalence -----------------------
  it("emits the exact message, help, severity, category and 1-based position for eval", () => {
    const diags = runRule(rule, 'eval("x");\n');
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-eval-or-function-constructor");
    expect(d.plugin).toBe("tsnuke");
    expect(d.severity).toBe("error");
    expect(d.category).toBe("Security");
    expect(d.message).toBe("`new Function` / `eval` execute arbitrary code.");
    expect(d.help).toBe("Call the code directly, or parse data with `JSON.parse`.");
    expect(d.line).toBe(1);
    expect(d.column).toBe(1); // `eval` starts at column 1 (1-based)
    expect(d.filePath).toBe("test.ts");
  });

  it("pins `new Function` position to the `new` keyword (1-based)", () => {
    const diags = runRule(rule, 'const f = new Function("return 1");\n');
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.line).toBe(1);
    expect(d.column).toBe(11); // `new` begins at the 11th char
  });

  // --- Added negatives: identifier-name matching must be exact -------------
  it("does not flag a member call named eval (foo.eval)", () => {
    expect(runRule(rule, 'foo.eval("x");\n')).toHaveLength(0);
  });

  it("does not flag an identifier merely starting with eval (evalThing)", () => {
    expect(runRule(rule, 'evalThing("x");\n')).toHaveLength(0);
  });

  it("does not flag `new MyFunction(...)` (callee name must be exactly Function)", () => {
    expect(runRule(rule, "const f = new MyFunction();\n")).toHaveLength(0);
  });

  it("does not flag a bare `Function` reference without `new`", () => {
    expect(runRule(rule, "const F = Function;\n")).toHaveLength(0);
  });

  it("flags both an eval call and a new Function in the same file", () => {
    const diags = runRule(
      rule,
      'eval("a");\nconst f = new Function("return 1");\n',
    );
    expect(diags).toHaveLength(2);
  });
});

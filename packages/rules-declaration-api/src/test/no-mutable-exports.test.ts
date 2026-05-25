import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-mutable-exports.js";

describe("no-mutable-exports (SYN)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags `export let`", () => {
    const diags = runRule(rule, "export let x = 1;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-mutable-exports");
  });

  it("flags `export var`", () => {
    const diags = runRule(rule, "export var y = 2;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-mutable-exports");
  });

  it("allows `export const`", () => {
    expect(runRule(rule, "export const z = 3;\n")).toHaveLength(0);
  });

  // --- Added edge cases the rule's logic implies ---

  it("carries the verbatim message/help + meta in the diagnostic", () => {
    const diags = runRule(rule, "export let x = 1;\n");
    expect(diags[0]!.message).toBe("Exported mutable binding; use `export const`.");
    expect(diags[0]!.help).toBe(
      "Replace `export let`/`export var` with `export const` so the binding can't be reassigned.",
    );
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.category).toBe("Declaration & API Hygiene");
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("reports 1-based line/column at the variable-statement start", () => {
    const diags = runRule(rule, "export let x = 1;\n");
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(1);
  });

  it("does NOT flag a non-exported `let`", () => {
    expect(runRule(rule, "let x = 1;\n")).toHaveLength(0);
  });

  it("does NOT flag a non-exported `var`", () => {
    expect(runRule(rule, "var y = 2;\n")).toHaveLength(0);
  });

  it("does NOT flag a non-exported `const`", () => {
    expect(runRule(rule, "const z = 3;\n")).toHaveLength(0);
  });

  it("flags an exported `let` with multiple declarators (one statement)", () => {
    const diags = runRule(rule, "export let a = 1, b = 2;\n");
    expect(diags).toHaveLength(1);
  });

  it("flags `export let` on line 2 with the correct line number", () => {
    const diags = runRule(rule, "const a = 1;\nexport let b = 2;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.line).toBe(2);
  });
});

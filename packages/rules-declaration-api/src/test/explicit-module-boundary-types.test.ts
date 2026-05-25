import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/explicit-module-boundary-types.js";

describe("explicit-module-boundary-types (SYN)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags an exported function with no return type", () => {
    const diags = runRule(rule, "export function f(x: number) { return x + 1; }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("explicit-module-boundary-types");
  });

  it("allows an exported function with an explicit return type", () => {
    expect(
      runRule(rule, "export function f(x: number): number { return x + 1; }\n"),
    ).toHaveLength(0);
  });

  it("ignores a non-exported function with no return type", () => {
    expect(runRule(rule, "function g(x: number) { return x; }\n")).toHaveLength(0);
  });

  // --- Added edge cases the rule's logic implies ---

  it("carries the verbatim message/help + meta in the diagnostic", () => {
    const diags = runRule(rule, "export function f(x: number) { return x + 1; }\n");
    expect(diags[0]!.message).toBe("Exported function lacks an explicit return type.");
    expect(diags[0]!.help).toBe("Annotate the return type for stable `.d.ts` output.");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.category).toBe("Declaration & API Hygiene");
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("reports 1-based line/column at the function start", () => {
    const diags = runRule(rule, "export function f(x: number) { return x + 1; }\n");
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(1);
  });

  it("ignores a non-exported function even with NO return type on line 2", () => {
    const diags = runRule(
      rule,
      "const a = 1;\nexport function f(x: number) { return x; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.line).toBe(2);
  });

  it("allows an exported async function with a Promise return type", () => {
    expect(
      runRule(
        rule,
        "export async function f(): Promise<number> { return 1; }\n",
      ),
    ).toHaveLength(0);
  });

  it("flags an exported async function with no return type", () => {
    expect(
      runRule(rule, "export async function f() { return 1; }\n"),
    ).toHaveLength(1);
  });

  it("does NOT flag arrow functions assigned to exported consts (only FunctionDeclaration)", () => {
    // The visitor is keyed to FunctionDeclaration; arrow-fn expressions are out of scope.
    expect(
      runRule(rule, "export const f = (x: number) => x + 1;\n"),
    ).toHaveLength(0);
  });

  it("does NOT flag a class method with no return type (not a FunctionDeclaration)", () => {
    expect(runRule(rule, "export class C { m() { return 1; } }\n")).toHaveLength(0);
  });

  it("flags two separate exported untyped functions independently", () => {
    const diags = runRule(
      rule,
      "export function a() { return 1; }\nexport function b() { return 2; }\n",
    );
    expect(diags).toHaveLength(2);
  });
});

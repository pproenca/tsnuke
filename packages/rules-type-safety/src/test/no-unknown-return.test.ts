import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-unknown-return.js";

// Ported VERBATIM from legacy `.../type-safety/no-unknown-return.test.ts`.
describe("no-unknown-return (SYN)", () => {
  it("flags a function returning `unknown`", () => {
    expect(runRule(rule, "function readJson(f: string): unknown { return JSON.parse(f); }\n")).toHaveLength(1);
  });

  it("flags a function returning `Promise<unknown>`", () => {
    expect(
      runRule(rule, "async function readJsonFile(f: string): Promise<unknown> { return JSON.parse(f); }\n"),
    ).toHaveLength(1);
  });

  it("flags an arrow returning `unknown`", () => {
    expect(runRule(rule, "const first = (a: unknown[]): unknown => a[0];\n")).toHaveLength(1);
  });

  it("does NOT flag an `unknown` parameter (that's good practice)", () => {
    expect(runRule(rule, "function f(x: unknown): string { return String(x); }\n")).toHaveLength(0);
  });

  it("does NOT flag a precise or `unknown[]` return", () => {
    expect(runRule(rule, "function f(): unknown[] { return []; }\n")).toHaveLength(0);
    expect(runRule(rule, "function g(): string { return ''; }\n")).toHaveLength(0);
  });

  // Augmentation: assert rule-id / tier / severity on a positive case.
  it("emits a SYN warning with the right rule id", () => {
    const diags = runRule(rule, "function f(): unknown { return undefined; }\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-unknown-return");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
  });
});

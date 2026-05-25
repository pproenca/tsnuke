import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-record-string-unknown.js";

// Ported VERBATIM from legacy `.../type-safety/no-record-string-unknown.test.ts`.
describe("no-record-string-unknown (SYN)", () => {
  it("flags a `Record<string, unknown>` type alias", () => {
    expect(runRule(rule, "export type Args = Record<string, unknown>;\n")).toHaveLength(1);
  });

  it("flags `Record<string, any>` in a parameter", () => {
    expect(
      runRule(rule, "export function f(a: Record<string, any>): void {}\n"),
    ).toHaveLength(1);
  });

  it("flags an index-signature-only object type", () => {
    expect(runRule(rule, "type Bag = { [k: string]: unknown };\n")).toHaveLength(1);
  });

  it("flags `interface X extends Record<string, unknown>`", () => {
    expect(
      runRule(rule, "export interface Args extends Record<string, unknown> { root?: string }\n"),
    ).toHaveLength(1);
  });

  it("does NOT flag a real interface or a typed record", () => {
    expect(runRule(rule, "type Real = { id: number; name: string };\n")).toHaveLength(0);
    expect(runRule(rule, "type M = Record<string, number>;\n")).toHaveLength(0);
  });

  // Augmentation: assert position/message/severity/rule-id on a positive case.
  it("emits a warning at the type reference with the bag message", () => {
    const diags = runRule(rule, "export type Args = Record<string, unknown>;\n");
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-record-string-unknown");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.line).toBe(1);
    expect(d.message).toContain("Untyped object bag");
  });
});

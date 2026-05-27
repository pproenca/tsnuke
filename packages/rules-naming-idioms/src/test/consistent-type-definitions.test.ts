import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/consistent-type-definitions.js";

// Characterization vectors ported VERBATIM from the legacy behavioral spec
// (legacy `.../naming-idioms/consistent-type-definitions.test.ts`). Passing these
// IS the proof of behavioral equivalence with the legacy rule.
describe("consistent-type-definitions (SYN)", () => {
  it("flags `type X = { ... }` object-shape alias", () => {
    const diags = runRule(rule, "type User = { id: number; name: string };\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("consistent-type-definitions");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.tier).toBe("SYN");
    expect(diags[0]!.category).toBe("Naming & Idioms");
    expect(diags[0]!.message).toContain("User");
    // 1-based position at the alias NAME (`User`, col 6 on line 1).
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(6);
  });

  it("does not flag a union alias", () => {
    expect(runRule(rule, "type Dir = 'n' | 's' | 'e' | 'w';\n")).toHaveLength(0);
  });

  it("does not flag an intersection alias", () => {
    expect(
      runRule(rule, "type A = { a: number };\ntype B = A & { b: string };\n"),
    ).toHaveLength(1); // only the `type A = {...}` object literal, not the intersection
  });

  it("does not flag a function-type alias", () => {
    expect(runRule(rule, "type Fn = (x: number) => string;\n")).toHaveLength(0);
  });

  it("does not flag a mapped-type alias", () => {
    expect(
      runRule(rule, "type Flags<T> = { [K in keyof T]: boolean };\n"),
    ).toHaveLength(0);
  });

  it("does not flag an empty-object alias", () => {
    expect(runRule(rule, "type Empty = {};\n")).toHaveLength(0);
  });

  it("does not flag an existing interface", () => {
    expect(runRule(rule, "interface User { id: number }\n")).toHaveLength(0);
  });

  // P4 (real codemod): rule now emits a `fix.edits` payload that rewrites
  // `type X = { … }` as `interface X { … }`. The trailing `;` after `}` is
  // legal in both forms — left in place.
  it("emits a codemod fix that rewrites the alias as an interface", () => {
    expect(rule.fixKind).toBe("codemod");
    const source = "type User = { id: number };\n";
    const diags = runRule(rule, source);
    expect(diags).toHaveLength(1);
    const fix = diags[0]!.fix;
    expect(fix).toBeDefined();
    expect(fix!.kind).toBe("codemod");
    expect(fix!.edits).toHaveLength(1);
    const edit = fix!.edits[0]!;
    const before = source.slice(edit.start, edit.end);
    expect(before).toBe("type User = ");
    expect(edit.replacement).toBe("interface User ");
  });

  it("preserves export modifier in the codemod", () => {
    const source = "export type User = { id: number };\n";
    const diags = runRule(rule, source);
    const edit = diags[0]!.fix!.edits[0]!;
    expect(source.slice(edit.start, edit.end)).toBe("export type User = ");
    expect(edit.replacement).toBe("export interface User ");
  });

  it("preserves generic parameters in the codemod", () => {
    const source = "type Box<T> = { value: T };\n";
    const diags = runRule(rule, source);
    const edit = diags[0]!.fix!.edits[0]!;
    expect(edit.replacement).toBe("interface Box<T> ");
  });
});

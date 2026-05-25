import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/prefer-union-over-enum.js";

// Ported VERBATIM from legacy `.../naming-idioms/prefer-union-over-enum.test.ts`.
describe("prefer-union-over-enum (SYN)", () => {
  it("flags an enum declaration", () => {
    const diags = runRule(rule, "enum Color { Red, Green }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("Color");
    expect(diags[0]!.rule).toBe("prefer-union-over-enum");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag a union type alias", () => {
    expect(runRule(rule, "type Color = 'red' | 'green';\n")).toHaveLength(0);
  });

  // Edge (verbatim): a `const enum` is also an EnumDeclaration, so it is flagged here too
  // (this rule does not gate on `const`; no-const-enum handles the stronger concern).
  it("also flags a `const enum`", () => {
    expect(runRule(rule, "const enum Color { Red }\n")).toHaveLength(1);
  });
});

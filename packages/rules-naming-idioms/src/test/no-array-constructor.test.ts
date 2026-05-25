import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-array-constructor.js";

// Ported VERBATIM from legacy `.../naming-idioms/no-array-constructor.test.ts`.
describe("no-array-constructor (SYN)", () => {
  it("flags `new Array(1, 2, 3)` (multi-arg — should be a literal)", () => {
    const diags = runRule(rule, "const a = new Array(1, 2, 3);\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-array-constructor");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("flags `Array()` with no arguments", () => {
    expect(runRule(rule, "const a = Array();\n")).toHaveLength(1);
  });

  it("flags `Array('x')` with a single non-numeric argument", () => {
    expect(runRule(rule, "const a = Array('x');\n")).toHaveLength(1);
  });

  it("allows `new Array(5)` (the unambiguous length form)", () => {
    expect(runRule(rule, "const a = new Array(5);\n")).toHaveLength(0);
  });

  it("allows `Array(5)` (single numeric length)", () => {
    expect(runRule(rule, "const a = Array(5);\n")).toHaveLength(0);
  });

  it("does not flag an unrelated identifier called as a constructor", () => {
    expect(
      runRule(rule, "class Box {}\nconst a = new Box(1, 2);\n"),
    ).toHaveLength(0);
  });

  // Edge (verbatim quirk): a single unary-numeric arg is treated as a length form.
  it("allows `new Array(-5)` (unary numeric length form)", () => {
    expect(runRule(rule, "const a = new Array(-5);\n")).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-ts-nocheck.js";

// Ported VERBATIM from legacy `.../type-assertions/no-ts-nocheck.test.ts`,
// plus severity + block-comment edge.
describe("no-ts-nocheck (SYN)", () => {
  it("flags a // @ts-nocheck directive", () => {
    const diags = runRule(rule, "// @ts-nocheck\nlet x = 1;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("SYN");
    expect(diags[0]!.rule).toBe("no-ts-nocheck");
    expect(diags[0]!.severity).toBe("error");
    expect(diags[0]!.line).toBe(1);
  });

  it("does not match @ts-nocheck inside a string literal", () => {
    expect(runRule(rule, "const s = '// @ts-nocheck';\n")).toHaveLength(0);
  });

  it("clean file → no finding", () => {
    expect(runRule(rule, "let x = 1;\n")).toHaveLength(0);
  });

  // Edge: a block-comment form `/* @ts-nocheck */` at line start is also matched.
  it("flags a block-comment `/* @ts-nocheck`", () => {
    expect(runRule(rule, "/* @ts-nocheck */\nlet x = 1;\n")).toHaveLength(1);
  });
});

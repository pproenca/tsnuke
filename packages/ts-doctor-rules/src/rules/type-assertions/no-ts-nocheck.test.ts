import { describe, expect, it } from "vitest";
import { rule } from "./no-ts-nocheck.js";
import { runRule } from "../../test-utils.js";

describe("no-ts-nocheck (SYN)", () => {
  it("flags a // @ts-nocheck directive", () => {
    const diags = runRule(rule, "// @ts-nocheck\nlet x = 1;\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("does not match @ts-nocheck inside a string literal", () => {
    expect(runRule(rule, "const s = '// @ts-nocheck';\n")).toHaveLength(0);
  });

  it("clean file → no finding", () => {
    expect(runRule(rule, "let x = 1;\n")).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { rule } from "./prefer-union-over-enum.js";
import { runRule } from "../../test-utils.js";

describe("prefer-union-over-enum (SYN)", () => {
  it("flags an enum declaration", () => {
    const diags = runRule(rule, "enum Color { Red, Green }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("Color");
  });

  it("does not flag a union type alias", () => {
    expect(runRule(rule, "type Color = 'red' | 'green';\n")).toHaveLength(0);
  });
});

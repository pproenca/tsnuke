import { describe, expect, it } from "vitest";
import { rule } from "./no-const-enum.js";
import { runRule } from "../../test-utils.js";

describe("no-const-enum (SYN)", () => {
  it("flags a `const enum`", () => {
    const diags = runRule(rule, "const enum Color { Red, Green }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-const-enum");
    expect(diags[0]!.severity).toBe("error");
  });

  it("does not flag a plain `enum`", () => {
    expect(runRule(rule, "enum Color { Red, Green }\n")).toHaveLength(0);
  });

  it("does not flag a `const` variable declaration", () => {
    expect(runRule(rule, "const x = 1;\n")).toHaveLength(0);
  });
});

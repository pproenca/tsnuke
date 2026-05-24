import { describe, expect, it } from "vitest";
import { rule } from "./no-var.js";
import { runRule } from "../../test-utils.js";

describe("no-var (SYN)", () => {
  it("flags a `var` declaration", () => {
    expect(runRule(rule, "var x = 1;\n")).toHaveLength(1);
  });

  it("flags `var` in a for-loop initializer", () => {
    expect(runRule(rule, "for (var i = 0; i < 3; i++) {}\n")).toHaveLength(1);
  });

  it("does NOT flag `let` or `const`", () => {
    expect(runRule(rule, "let y = 2;\nconst z = 3;\n")).toHaveLength(0);
  });
});

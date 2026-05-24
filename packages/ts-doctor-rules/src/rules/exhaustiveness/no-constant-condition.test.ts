import { describe, expect, it } from "vitest";
import { rule } from "./no-constant-condition.js";
import { runRule } from "../../test-utils.js";

describe("no-constant-condition (SYN)", () => {
  it("flags an if with a literal condition", () => {
    const diags = runRule(rule, "if (true) { f(); }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-constant-condition");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.message).toContain("constant condition");
  });

  it("flags a conditional (ternary) with a literal condition", () => {
    expect(runRule(rule, "const x = 1 ? a : b;\n")).toHaveLength(1);
  });

  it("does not flag an if with a real predicate", () => {
    expect(runRule(rule, "if (x) { f(); }\n")).toHaveLength(0);
  });

  it("does not flag while(true) — a legitimate loop idiom", () => {
    expect(runRule(rule, "while (true) { f(); }\n")).toHaveLength(0);
  });
});

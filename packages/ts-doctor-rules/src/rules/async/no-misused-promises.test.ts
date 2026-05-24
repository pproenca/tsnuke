import { describe, expect, it } from "vitest";
import { rule } from "./no-misused-promises.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("no-misused-promises (TYP / BC-10)", () => {
  it("flags a Promise used as an `if` condition under a live checker", () => {
    const code =
      "declare function p(): Promise<boolean>;\nfunction f() { if (p()) { g(); } }\ndeclare function g(): void;\n";
    const diags = runTypeAwareRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-misused-promises");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("error");
  });

  it("flags a Promise used as a `while` condition", () => {
    const code =
      "declare function p(): Promise<boolean>;\nfunction f() { while (p()) {} }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(1);
  });

  it("flags a Promise used as a ternary condition", () => {
    const code =
      "declare function p(): Promise<boolean>;\nfunction f() { return p() ? 1 : 2; }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(1);
  });

  it("does not flag a plain boolean condition", () => {
    const code =
      "declare function p(): boolean;\nfunction f() { if (p()) {} }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("does not flag an awaited promise condition", () => {
    const code =
      "declare function p(): Promise<boolean>;\nasync function f() { if (await p()) {} }\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    const code =
      "declare function p(): Promise<boolean>;\nfunction f() { if (p()) {} }\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { rule } from "./no-unnecessary-condition.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("no-unnecessary-condition (TYP / BC-10)", () => {
  it("flags an always-truthy non-empty object condition", () => {
    const code = "declare const o: { a: number };\nif (o) { f(); }\ndeclare function f(): void;\n";
    const diags = runTypeAwareRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unnecessary-condition");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.message).toBe("condition is always truthy");
  });

  it("does not flag a nullable condition", () => {
    const code = "declare const s: string | undefined;\nif (s) {}\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("does not flag the empty object type `{}`", () => {
    const code = "declare const e: {};\nif (e) {}\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("does not flag a primitive condition", () => {
    const code = "declare const n: number;\nif (n) {}\n";
    expect(runTypeAwareRule(rule, code)).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    const code = "declare const o: { a: number };\nif (o) {}\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });
});

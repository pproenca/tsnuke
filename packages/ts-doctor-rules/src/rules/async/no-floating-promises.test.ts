import { describe, expect, it } from "vitest";
import { rule } from "./no-floating-promises.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("no-floating-promises (TYP / BC-10)", () => {
  it("flags a floating promise under a live checker", () => {
    const diags = runTypeAwareRule(rule, "Promise.resolve(1);\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-floating-promises");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("error");
    // Carries a machine-applicable fix with the inferred promise type (BC-14).
    expect(diags[0]!.fix?.kind).toBe("auto-fix");
    expect(diags[0]!.fix?.inferredType).toContain("Promise");
  });

  it("does not flag an awaited promise", () => {
    const diags = runTypeAwareRule(
      rule,
      "async function f() { await Promise.resolve(1); }\n",
    );
    expect(diags).toHaveLength(0);
  });

  it("does not flag a voided promise", () => {
    expect(runTypeAwareRule(rule, "void Promise.resolve(1);\n")).toHaveLength(0);
  });

  it("does not flag a non-promise expression statement", () => {
    expect(runTypeAwareRule(rule, "declare const x: number;\nx;\n")).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(runRule(rule, "Promise.resolve(1);\n")).toHaveLength(0);
  });
});

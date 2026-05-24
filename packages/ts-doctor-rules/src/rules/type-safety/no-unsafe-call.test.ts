import { describe, expect, it } from "vitest";
import { rule } from "./no-unsafe-call.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("no-unsafe-call (TYP / BC-10)", () => {
  it("flags a call on an `any`-typed callee under a live checker", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare const x: any;\nfunction f() { return x(); }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unsafe-call");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("error");
  });

  it("does not flag calling a precisely-typed function", () => {
    const diags = runTypeAwareRule(
      rule,
      "function g(): number { return 1; }\nfunction f() { return g(); }\n",
    );
    expect(diags).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(rule, "declare const x: any;\nfunction f() { return x(); }\n"),
    ).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { rule } from "./no-unnecessary-non-null-assertion.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("no-unnecessary-non-null-assertion (TYP / BC-10)", () => {
  it("flags `!` on an operand that cannot be nullish under a live checker", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare const x: number;\nconst y = x!;\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unnecessary-non-null-assertion");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag `!` on an operand that can be `undefined`", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare const x: number | undefined;\nconst y = x!;\n",
    );
    expect(diags).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(rule, "declare const x: number;\nconst y = x!;\n"),
    ).toHaveLength(0);
  });
});

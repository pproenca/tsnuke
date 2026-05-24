import { describe, expect, it } from "vitest";
import { rule } from "./no-unnecessary-boolean-literal-compare.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("no-unnecessary-boolean-literal-compare (TYP / BC-10)", () => {
  it("flags comparing a boolean to a boolean literal under a live checker", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare const b: boolean;\nfunction f() { return b === true; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unnecessary-boolean-literal-compare");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag comparing a non-boolean to a string literal", () => {
    const diags = runTypeAwareRule(
      rule,
      'declare const s: string;\nfunction f() { return s === "true"; }\n',
    );
    expect(diags).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(
        rule,
        "declare const b: boolean;\nfunction f() { return b === true; }\n",
      ),
    ).toHaveLength(0);
  });
});

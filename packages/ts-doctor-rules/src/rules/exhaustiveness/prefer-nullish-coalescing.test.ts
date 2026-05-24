import { describe, expect, it } from "vitest";
import { rule } from "./prefer-nullish-coalescing.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("prefer-nullish-coalescing (TYP / BC-10)", () => {
  it("flags `||` on a nullable left operand under a live checker", () => {
    const diags = runTypeAwareRule(
      rule,
      'declare const x: string | undefined;\nfunction f() { return x || "default"; }\n',
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("prefer-nullish-coalescing");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag `||` on a non-nullable left operand", () => {
    const diags = runTypeAwareRule(
      rule,
      'declare const x: string;\nfunction f() { return x || "default"; }\n',
    );
    expect(diags).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(
        rule,
        'declare const x: string | undefined;\nfunction f() { return x || "default"; }\n',
      ),
    ).toHaveLength(0);
  });
});

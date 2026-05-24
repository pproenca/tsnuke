import { describe, expect, it } from "vitest";
import { rule } from "./prefer-optional-chain.js";
import { runRule } from "../../test-utils.js";

describe("prefer-optional-chain (SYN)", () => {
  it("flags the `a && a.b` guard pattern", () => {
    const diags = runRule(
      rule,
      "declare const a: { b?: number } | null;\nconst x = a && a.b;\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("a?.b");
  });

  it("does not flag a plain property access", () => {
    expect(
      runRule(
        rule,
        "declare const a: { b?: number };\nconst x = a.b;\n",
      ),
    ).toHaveLength(0);
  });
});

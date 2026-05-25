import { describe, expect, it } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/prefer-optional-chain.js";

// Ported VERBATIM from legacy `.../naming-idioms/prefer-optional-chain.test.ts`.
describe("prefer-optional-chain (SYN)", () => {
  it("flags the `a && a.b` guard pattern", () => {
    const diags = runRule(
      rule,
      "declare const a: { b?: number } | null;\nconst x = a && a.b;\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("a?.b");
    expect(diags[0]!.rule).toBe("prefer-optional-chain");
  });

  it("does not flag a plain property access", () => {
    expect(
      runRule(rule, "declare const a: { b?: number };\nconst x = a.b;\n"),
    ).toHaveLength(0);
  });

  // Edge (verbatim): a guard whose two identifiers differ is NOT flagged.
  it("does not flag `a && b.c` (different identifiers)", () => {
    expect(
      runRule(
        rule,
        "declare const a: unknown;\ndeclare const b: { c?: number };\nconst x = a && b.c;\n",
      ),
    ).toHaveLength(0);
  });
});

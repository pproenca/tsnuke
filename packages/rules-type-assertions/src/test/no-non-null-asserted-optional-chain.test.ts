import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-non-null-asserted-optional-chain.js";

// Ported VERBATIM from legacy `.../type-assertions/no-non-null-asserted-optional-chain.test.ts`,
// plus a parenthesized edge and a plain-`!` negative.
describe("SYN rule — no-non-null-asserted-optional-chain", () => {
  it("flags `!` applied to an optional-chain result (BC-10: tier SYN)", () => {
    const code = "declare const a: { b?: number } | null;\nconst x = a?.b!;\n";
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-non-null-asserted-optional-chain");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("error");
  });

  it("does not flag plain member access without an optional chain", () => {
    const code = "declare const a: { b: number };\nconst x = a.b;\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  // Edge: parenthesized `(a?.b)!` is still caught.
  it("flags `(a?.b)!`", () => {
    const code = "declare const a: { b?: number } | null;\nconst x = (a?.b)!;\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });

  // Negative: a non-null assertion on a non-optional-chain expression is NOT
  // this rule's concern (that's `no-non-null-assertion`).
  it("does not flag a plain `x!` with no optional chain", () => {
    const code = "declare const x: string | undefined;\nconst y = x!;\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });
});

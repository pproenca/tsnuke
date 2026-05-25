import { describe, it, expect } from "vitest";
import { runRule } from "@ts-doctor/rules-core-effect";
import { rule } from "../main/no-non-null-assertion.js";

// Ported VERBATIM from legacy `.../type-assertions/no-non-null-assertion.test.ts`,
// plus severity assertion and a multi-occurrence edge.
describe("SYN rule — no-non-null-assertion", () => {
  it("flags a non-null assertion `expr!` (BC-10: tier SYN)", () => {
    const code = "declare const x: string | undefined;\nconst y = x!.length;\n";
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-non-null-assertion");
    expect(d.tier).toBe("SYN");
    expect(d.severity).toBe("warning");
    expect(d.line).toBe(2);
  });

  it("does not flag plain member access", () => {
    const code = "declare const x: string;\nconst y = x.length;\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  // Edge: every `!` is flagged (one per NonNullExpression).
  it("flags each non-null assertion", () => {
    const code =
      "declare const a: string | undefined;\ndeclare const b: string | undefined;\n" +
      "const r = a! + b!;\n";
    expect(runRule(rule, code)).toHaveLength(2);
  });
});

import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-unnecessary-non-null-assertion.js";

// Ported VERBATIM from legacy `.../type-assertions/no-unnecessary-non-null-assertion.test.ts`.
// This is the ONE TYP rule: it needs a live `ts.TypeChecker`, so positive cases run
// through `runTypeAwareRule` (which builds a one-file program + checker) and the
// no-checker / Tier-1 case runs through `runRule` (no checker → early return).
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

  // Edge: an operand that can be `null` keeps the `!` (real work) — not flagged.
  it("does not flag `!` on an operand that can be `null`", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare const x: string | null;\nconst y = x!;\n",
    );
    expect(diags).toHaveLength(0);
  });

  // Edge: a plain non-nullable string operand is flagged as unnecessary.
  it("flags `!` on a non-nullable string operand", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare const s: string;\nconst y = s!;\n",
    );
    expect(diags).toHaveLength(1);
  });
});

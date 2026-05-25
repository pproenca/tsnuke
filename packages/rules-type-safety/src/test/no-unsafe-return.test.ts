import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-unsafe-return.js";

// Ported VERBATIM from legacy `.../type-safety/no-unsafe-return.test.ts`, plus a
// negative for the `no-unsafe-*` family (a safe typed return is NOT flagged).
describe("no-unsafe-return (TYP / BC-10)", () => {
  it("flags returning an `any`-typed value under a live checker", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare const x: any;\nfunction f() { return x; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unsafe-return");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag returning a precisely-typed value", () => {
    const diags = runTypeAwareRule(rule, "function f() { return 1; }\n");
    expect(diags).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(rule, "declare const x: any;\nfunction f() { return x; }\n"),
    ).toHaveLength(0);
  });

  // Negative: a bare `return;` has no expression — nothing to check.
  it("does not flag a bare `return;`", () => {
    expect(
      runTypeAwareRule(rule, "function f(): void { return; }\n"),
    ).toHaveLength(0);
  });

  // Negative: returning a typed variable is safe.
  it("does not flag returning a typed variable", () => {
    expect(
      runTypeAwareRule(
        rule,
        "declare const n: number;\nfunction f() { return n; }\n",
      ),
    ).toHaveLength(0);
  });
});

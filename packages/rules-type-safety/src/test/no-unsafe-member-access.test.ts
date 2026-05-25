import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-unsafe-member-access.js";

// Ported VERBATIM from legacy `.../type-safety/no-unsafe-member-access.test.ts`,
// plus a negative for the `no-unsafe-*` family (safe member access NOT flagged).
describe("no-unsafe-member-access (TYP / BC-10)", () => {
  it("flags member access on an `any`-typed receiver under a live checker", () => {
    const diags = runTypeAwareRule(
      rule,
      "declare const x: any;\nfunction f() { return x.foo; }\n",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unsafe-member-access");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("error");
  });

  it("does not flag member access on a precisely-typed object", () => {
    const diags = runTypeAwareRule(
      rule,
      "const o = { foo: 1 };\nfunction f() { return o.foo; }\n",
    );
    expect(diags).toHaveLength(0);
  });

  it("emits nothing without a checker (Tier-1 / gated path)", () => {
    expect(
      runRule(rule, "declare const x: any;\nfunction f() { return x.foo; }\n"),
    ).toHaveLength(0);
  });

  // Negative: element access on a typed array receiver is safe.
  it("does not flag element access on a typed array receiver", () => {
    expect(
      runTypeAwareRule(
        rule,
        "declare const arr: number[];\nfunction f() { return arr[0]; }\n",
      ),
    ).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { rule } from "./no-unsafe-member-access.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

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
});

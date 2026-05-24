import { describe, expect, it } from "vitest";
import { rule } from "./no-unnecessary-typeof.js";
import { runRule, runTypeAwareRule } from "../../test-utils.js";

describe("no-unnecessary-typeof (TYP)", () => {
  it("flags an always-true typeof (type already guarantees it)", () => {
    const diags = runTypeAwareRule(
      rule,
      'declare const x: string;\nfunction f() { return typeof x === "string"; }\n',
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.message).toContain("always true");
  });

  it("flags an always-false typeof (type can never be that)", () => {
    const diags = runTypeAwareRule(
      rule,
      'declare const x: number;\nfunction f() { return typeof x === "string"; }\n',
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("always false");
  });

  it("does NOT flag a legitimate guard on a union", () => {
    expect(
      runTypeAwareRule(
        rule,
        'declare const x: string | number;\nfunction f() { return typeof x === "string"; }\n',
      ),
    ).toHaveLength(0);
  });

  it("emits nothing without a checker (gated)", () => {
    expect(runRule(rule, 'declare const x: string;\nconst b = typeof x === "string";\n')).toHaveLength(0);
  });
});

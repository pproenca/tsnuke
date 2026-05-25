import { describe, expect, it } from "vitest";
import { runRule, runTypeAwareRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-unnecessary-typeof.js";

// Ported VERBATIM from legacy `.../type-safety/no-unnecessary-typeof.test.ts`.
describe("no-unnecessary-typeof (TYP)", () => {
  it("flags an always-true typeof (type already guarantees it)", () => {
    const diags = runTypeAwareRule(
      rule,
      'declare const x: string;\nfunction f() { return typeof x === "string"; }\n',
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unnecessary-typeof");
    expect(diags[0]!.tier).toBe("TYP");
    expect(diags[0]!.severity).toBe("warning");
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

  // Negative: an `unknown` receiver can't be reasoned about — bail (no flag).
  it("does NOT flag `typeof` on an `unknown` value", () => {
    expect(
      runTypeAwareRule(
        rule,
        'declare const x: unknown;\nfunction f() { return typeof x === "string"; }\n',
      ),
    ).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { namingIdiomsRules } from "../main/index.js";

// Category-level META invariants (RULE-025 shape + RULE-026 broken-auto-fix tally).
describe("namingIdiomsRules barrel", () => {
  it("exports exactly the 14 naming-idioms rules", () => {
    expect(namingIdiomsRules).toHaveLength(14);
    expect(namingIdiomsRules.map((r) => r.id)).toEqual([
      "consistent-type-definitions",
      "no-array-constructor",
      "no-const-enum",
      "no-empty-interface",
      "no-inferrable-type-annotation",
      "no-json-parse-stringify-clone",
      "no-namespace",
      "no-unnecessary-template-literal",
      "no-var",
      "pascal-case-types",
      "prefer-array-methods",
      "prefer-optional-chain",
      "prefer-union-over-enum",
      "triple-equals",
    ]);
  });

  it("every rule is SYN, in the `Naming & Idioms` category", () => {
    for (const r of namingIdiomsRules) {
      expect(r.tier).toBe("SYN");
      expect(r.category).toBe("Naming & Idioms");
    }
  });

  it("rule ids are unique", () => {
    const ids = namingIdiomsRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only `no-const-enum` is error severity; the rest are warnings", () => {
    const errors = namingIdiomsRules.filter((r) => r.severity === "error");
    expect(errors.map((r) => r.id)).toEqual(["no-const-enum"]);
  });

  // RULE-026: exactly four rules declare fixKind:"auto-fix" but (proven per-rule
  // in the rule tests) emit NO fix payload — preserved verbatim from legacy.
  it("the four RULE-026 rules declare auto-fix (and emit no fix payloads)", () => {
    const autoFix = namingIdiomsRules
      .filter((r) => r.fixKind === "auto-fix")
      .map((r) => r.id);
    expect(autoFix.sort()).toEqual(
      [
        "no-const-enum",
        "no-inferrable-type-annotation",
        "no-var",
        "triple-equals",
      ].sort(),
    );
  });

  it("every rule is callable through the substrate (`create` returns visitors)", () => {
    for (const r of namingIdiomsRules) {
      expect(typeof r.create).toBe("function");
    }
  });
});

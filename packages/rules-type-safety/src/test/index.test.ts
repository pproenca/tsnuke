import { describe, expect, it } from "vitest";
import { typeSafetyRules } from "../main/index.js";

// Category-level META invariants (RULE-006 + RULE-025 type-safety row: 6 SYN + 6 TYP).
describe("typeSafetyRules barrel", () => {
  it("exports exactly the 12 type-safety rules, in id order", () => {
    expect(typeSafetyRules).toHaveLength(12);
    expect(typeSafetyRules.map((r) => r.id)).toEqual([
      "any-density-budget",
      "no-explicit-any",
      "no-record-string-unknown",
      "no-unknown-return",
      "no-unnecessary-instanceof",
      "no-unnecessary-typeof",
      "no-unsafe-argument",
      "no-unsafe-call",
      "no-unsafe-member-access",
      "no-unsafe-return",
      "no-wrapper-object-types",
      "prefer-type-guard-predicate",
    ]);
  });

  it("every rule is in the `Type Safety` category", () => {
    for (const r of typeSafetyRules) {
      expect(r.category).toBe("Type Safety");
    }
  });

  it("6 rules are SYN and 6 are TYP (the no-unsafe-* + unnecessary-guard family)", () => {
    const syn = typeSafetyRules.filter((r) => r.tier === "SYN");
    const typ = typeSafetyRules.filter((r) => r.tier === "TYP");
    expect(syn.map((r) => r.id)).toEqual([
      "any-density-budget",
      "no-explicit-any",
      "no-record-string-unknown",
      "no-unknown-return",
      "no-wrapper-object-types",
      "prefer-type-guard-predicate",
    ]);
    expect(typ.map((r) => r.id)).toEqual([
      "no-unnecessary-instanceof",
      "no-unnecessary-typeof",
      "no-unsafe-argument",
      "no-unsafe-call",
      "no-unsafe-member-access",
      "no-unsafe-return",
    ]);
  });

  it("every TYP rule requires `typecheck:ok`", () => {
    for (const r of typeSafetyRules.filter((r) => r.tier === "TYP")) {
      expect(r.requires).toEqual(["typecheck:ok"]);
    }
  });

  it("no SYN rule declares `requires`", () => {
    for (const r of typeSafetyRules.filter((r) => r.tier === "SYN")) {
      expect(r.requires).toBeUndefined();
    }
  });

  it("rule ids are unique", () => {
    const ids = typeSafetyRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // error severity is exactly the three `no-unsafe-*` call/argument/member rules.
  it("error severity is exactly the three call-site no-unsafe-* bans", () => {
    const errors = typeSafetyRules
      .filter((r) => r.severity === "error")
      .map((r) => r.id);
    expect(errors.sort()).toEqual(
      ["no-unsafe-argument", "no-unsafe-call", "no-unsafe-member-access"].sort(),
    );
  });

  // Every rule in this category is `manual` fixKind (no RULE-026 broken auto-fix).
  it("every rule declares `manual` fixKind (no broken auto-fix)", () => {
    for (const r of typeSafetyRules) {
      expect(r.fixKind).toBe("manual");
    }
    const autoFix = typeSafetyRules.filter((r) => r.fixKind === "auto-fix");
    expect(autoFix).toHaveLength(0);
  });

  it("every rule is callable through the substrate (`create` returns visitors)", () => {
    for (const r of typeSafetyRules) {
      expect(typeof r.create).toBe("function");
    }
  });
});

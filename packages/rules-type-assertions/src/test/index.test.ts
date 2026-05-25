import { describe, expect, it } from "vitest";
import { typeAssertionsRules } from "../main/index.js";

// Category-level META invariants (RULE-025 type-assertions shape: 12 SYN + 1 TYP).
describe("typeAssertionsRules barrel", () => {
  it("exports exactly the 13 type-assertions rules, in id order", () => {
    expect(typeAssertionsRules).toHaveLength(13);
    expect(typeAssertionsRules.map((r) => r.id)).toEqual([
      "no-angle-bracket-assertion",
      "no-assertion-on-json-parse",
      "no-cast-after-guard",
      "no-cast-in-return",
      "no-double-assertion",
      "no-non-null-asserted-optional-chain",
      "no-non-null-assertion",
      "no-ts-ignore",
      "no-ts-nocheck",
      "no-unnecessary-non-null-assertion",
      "no-unsafe-object-assertion",
      "prefer-satisfies-over-as",
      "ts-expect-error-requires-description",
    ]);
  });

  it("every rule is in the `Type Assertions & Escapes` category", () => {
    for (const r of typeAssertionsRules) {
      expect(r.category).toBe("Type Assertions & Escapes");
    }
  });

  it("12 rules are SYN; only `no-unnecessary-non-null-assertion` is TYP", () => {
    const typ = typeAssertionsRules.filter((r) => r.tier === "TYP");
    const syn = typeAssertionsRules.filter((r) => r.tier === "SYN");
    expect(syn).toHaveLength(12);
    expect(typ.map((r) => r.id)).toEqual(["no-unnecessary-non-null-assertion"]);
  });

  it("the TYP rule requires `typecheck:ok`", () => {
    const typ = typeAssertionsRules.find(
      (r) => r.id === "no-unnecessary-non-null-assertion",
    );
    expect(typ?.requires).toEqual(["typecheck:ok"]);
  });

  it("rule ids are unique", () => {
    const ids = typeAssertionsRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Three rules are error severity; the rest are warnings.
  it("error severity is exactly the three escape-hatch bans", () => {
    const errors = typeAssertionsRules
      .filter((r) => r.severity === "error")
      .map((r) => r.id);
    expect(errors.sort()).toEqual(
      [
        "no-double-assertion",
        "no-non-null-asserted-optional-chain",
        "no-ts-nocheck",
      ].sort(),
    );
  });

  // No type-assertions rule declares `auto-fix` (no RULE-026 broken-fix quirk here;
  // they are codemod or manual only).
  it("no rule declares the broken `auto-fix` fixKind", () => {
    const autoFix = typeAssertionsRules.filter((r) => r.fixKind === "auto-fix");
    expect(autoFix).toHaveLength(0);
  });

  it("every rule is callable through the substrate (`create` returns visitors)", () => {
    for (const r of typeAssertionsRules) {
      expect(typeof r.create).toBe("function");
    }
  });
});

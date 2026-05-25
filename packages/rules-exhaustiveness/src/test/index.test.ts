import { describe, expect, it } from "vitest";
import {
  exhaustivenessRules,
  defaultCaseLast,
  noConstantCondition,
  preferDiscriminatedUnion,
  noForInArray,
  noUnnecessaryBooleanLiteralCompare,
  noUnnecessaryCondition,
  preferNullishCoalescing,
  switchExhaustivenessCheck,
} from "../main/index.js";

describe("exhaustiveness barrel", () => {
  it("exposes all eight rules in the category array", () => {
    expect(exhaustivenessRules).toHaveLength(8);
  });

  it("lists the rule ids in stable order", () => {
    expect(exhaustivenessRules.map((r) => r.id)).toEqual([
      "default-case-last",
      "no-constant-condition",
      "prefer-discriminated-union",
      "no-for-in-array",
      "no-unnecessary-boolean-literal-compare",
      "no-unnecessary-condition",
      "prefer-nullish-coalescing",
      "switch-exhaustiveness-check",
    ]);
  });

  it("array members are the same objects as the named exports", () => {
    expect(exhaustivenessRules).toEqual([
      defaultCaseLast,
      noConstantCondition,
      preferDiscriminatedUnion,
      noForInArray,
      noUnnecessaryBooleanLiteralCompare,
      noUnnecessaryCondition,
      preferNullishCoalescing,
      switchExhaustivenessCheck,
    ]);
  });

  it("every rule is in the Exhaustiveness & Narrowing category with a create factory", () => {
    for (const r of exhaustivenessRules) {
      expect(r.category).toBe("Exhaustiveness & Narrowing");
      expect(typeof r.create).toBe("function");
    }
  });

  it("splits into exactly 3 SYN + 5 TYP", () => {
    const syn = exhaustivenessRules.filter((r) => r.tier === "SYN");
    const typ = exhaustivenessRules.filter((r) => r.tier === "TYP");
    expect(syn.map((r) => r.id)).toEqual([
      "default-case-last",
      "no-constant-condition",
      "prefer-discriminated-union",
    ]);
    expect(typ.map((r) => r.id)).toEqual([
      "no-for-in-array",
      "no-unnecessary-boolean-literal-compare",
      "no-unnecessary-condition",
      "prefer-nullish-coalescing",
      "switch-exhaustiveness-check",
    ]);
  });

  it("all five TYP rules require the `typecheck:ok` capability", () => {
    const typ = exhaustivenessRules.filter((r) => r.tier === "TYP");
    for (const r of typ) {
      expect(r.requires).toEqual(["typecheck:ok"]);
    }
  });

  it("SYN rules declare no capability requirement", () => {
    const syn = exhaustivenessRules.filter((r) => r.tier === "SYN");
    for (const r of syn) {
      expect(r.requires).toBeUndefined();
    }
  });

  it("severities match legacy (no-for-in-array + switch-exhaustiveness-check are errors)", () => {
    const errors = exhaustivenessRules
      .filter((r) => r.severity === "error")
      .map((r) => r.id);
    expect(errors).toEqual(["no-for-in-array", "switch-exhaustiveness-check"]);
  });
});

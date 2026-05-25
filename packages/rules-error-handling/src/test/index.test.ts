import { describe, expect, it } from "vitest";
import {
  errorHandlingRules,
  noEmptyCatch,
  noErrorMessageMatching,
  noExAssign,
  noThrowInFinally,
  noUselessCatch,
  preferErrorInstantiation,
  onlyThrowError,
  preferPromiseRejectErrors,
} from "../main/index.js";

describe("error-handling barrel", () => {
  it("exposes all eight rules in the category array", () => {
    expect(errorHandlingRules).toHaveLength(8);
  });

  it("lists the rule ids in stable order", () => {
    expect(errorHandlingRules.map((r) => r.id)).toEqual([
      "no-empty-catch",
      "no-error-message-matching",
      "no-ex-assign",
      "no-throw-in-finally",
      "no-useless-catch",
      "prefer-error-instantiation",
      "only-throw-error",
      "prefer-promise-reject-errors",
    ]);
  });

  it("array members are the same objects as the named exports", () => {
    expect(errorHandlingRules).toEqual([
      noEmptyCatch,
      noErrorMessageMatching,
      noExAssign,
      noThrowInFinally,
      noUselessCatch,
      preferErrorInstantiation,
      onlyThrowError,
      preferPromiseRejectErrors,
    ]);
  });

  it("every rule is in the Error Handling category with a create factory", () => {
    for (const r of errorHandlingRules) {
      expect(r.category).toBe("Error Handling");
      expect(typeof r.create).toBe("function");
    }
  });

  it("splits into exactly 6 SYN + 2 TYP", () => {
    const syn = errorHandlingRules.filter((r) => r.tier === "SYN");
    const typ = errorHandlingRules.filter((r) => r.tier === "TYP");
    expect(syn.map((r) => r.id)).toEqual([
      "no-empty-catch",
      "no-error-message-matching",
      "no-ex-assign",
      "no-throw-in-finally",
      "no-useless-catch",
      "prefer-error-instantiation",
    ]);
    expect(typ.map((r) => r.id)).toEqual([
      "only-throw-error",
      "prefer-promise-reject-errors",
    ]);
  });

  it("the two TYP rules require the `typecheck:ok` capability", () => {
    expect(onlyThrowError.requires).toEqual(["typecheck:ok"]);
    expect(preferPromiseRejectErrors.requires).toEqual(["typecheck:ok"]);
  });

  it("RULE-026: prefer-error-instantiation is the only auto-fix-declared rule here", () => {
    const autoFix = errorHandlingRules.filter((r) => r.fixKind === "auto-fix");
    expect(autoFix.map((r) => r.id)).toEqual(["prefer-error-instantiation"]);
  });
});

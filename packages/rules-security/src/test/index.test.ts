import { describe, expect, it } from "vitest";
import {
  noEvalOrFunctionConstructor,
  noImpliedEval,
  noInsecureUrl,
  noNewBuffer,
  noSecretsInSource,
  securityRules,
} from "../main/index.js";

describe("security rule barrel", () => {
  it("exports exactly the 5 security rules in the registry", () => {
    expect(securityRules).toHaveLength(5);
    expect(securityRules.map((r) => r.id)).toEqual([
      "no-eval-or-function-constructor",
      "no-implied-eval",
      "no-insecure-url",
      "no-new-buffer",
      "no-secrets-in-source",
    ]);
  });

  it("every rule is SYN, Security category, with a create factory", () => {
    for (const r of securityRules) {
      expect(r.tier).toBe("SYN");
      expect(r.category).toBe("Security");
      expect(typeof r.create).toBe("function");
      expect(r.tags).toContain("security");
    }
  });

  it("named exports are the same objects as the registry entries", () => {
    expect(securityRules).toContain(noEvalOrFunctionConstructor);
    expect(securityRules).toContain(noImpliedEval);
    expect(securityRules).toContain(noInsecureUrl);
    expect(securityRules).toContain(noNewBuffer);
    expect(securityRules).toContain(noSecretsInSource);
  });

  it("severities match the legacy meta (4 error, 1 warning)", () => {
    const errors = securityRules.filter((r) => r.severity === "error");
    const warnings = securityRules.filter((r) => r.severity === "warning");
    expect(errors).toHaveLength(4);
    expect(warnings).toHaveLength(1);
    expect(noInsecureUrl.severity).toBe("warning");
  });
});

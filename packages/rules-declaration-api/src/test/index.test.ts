import { describe, expect, it } from "vitest";
import {
  declarationApiRules,
  explicitMemberAccessibility,
  explicitModuleBoundaryTypes,
  noExportAssignment,
  noMutableExports,
} from "../main/index.js";

describe("declaration-api barrel", () => {
  it("exposes all four rules in the category array", () => {
    expect(declarationApiRules).toHaveLength(4);
  });

  it("lists the rule ids in stable order", () => {
    expect(declarationApiRules.map((r) => r.id)).toEqual([
      "explicit-member-accessibility",
      "explicit-module-boundary-types",
      "no-export-assignment",
      "no-mutable-exports",
    ]);
  });

  it("array members are the same objects as the named exports", () => {
    expect(declarationApiRules).toEqual([
      explicitMemberAccessibility,
      explicitModuleBoundaryTypes,
      noExportAssignment,
      noMutableExports,
    ]);
  });

  it("every rule is SYN tier, warning severity, in the Declaration & API Hygiene category", () => {
    for (const r of declarationApiRules) {
      expect(r.tier).toBe("SYN");
      expect(r.severity).toBe("warning");
      expect(r.category).toBe("Declaration & API Hygiene");
      expect(typeof r.create).toBe("function");
    }
  });
});

/**
 * Characterization — the hand-written `ruleRegistry` (the C20 codegen seam; v1 is a
 * manual list of the 4 strictness rules until the full catalog + codegen land).
 */

import { describe, expect, it } from "vitest";
import { ruleRegistry } from "../main/index.js";

const EXPECTED_IDS = [
  "enable-strict",
  "enable-no-unchecked-indexed-access",
  "enable-exact-optional-property-types",
  "enable-use-unknown-in-catch",
] as const;

describe("ruleRegistry — the v1 manual list", () => {
  it("contains exactly the 4 strictness rules", () => {
    expect(ruleRegistry).toHaveLength(4);
  });

  it("registers every expected id (order-independent)", () => {
    expect(ruleRegistry.map((r) => r.id).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it("has unique ids", () => {
    const ids = ruleRegistry.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry carries required metadata + a create() factory", () => {
    for (const r of ruleRegistry) {
      expect(r.id).toBeTruthy();
      expect(["error", "warning"]).toContain(r.severity);
      expect(["SYN", "TYP", "GRAPH", "CFG"]).toContain(r.tier);
      expect(r.category).toBeTruthy();
      expect(typeof r.create).toBe("function");
    }
  });

  it("every entry is a CFG strictness rule (the only category seeded in v1)", () => {
    for (const r of ruleRegistry) {
      expect(r.tier).toBe("CFG");
      expect(r.category).toBe("Compiler Strictness Gaps");
    }
  });
});

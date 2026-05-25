/**
 * Registry contract for the rules-graph slice.
 *
 * Asserts the barrel publishes exactly the two GRAPH-tier rules (RULE-015 + RULE-025
 * dead-code), uniquely id'd, all tier `GRAPH` — the GRAPH analog of the module-boundaries
 * deferral guard. This makes the slice's shape EXECUTABLE so a future batch can't silently
 * mis-wire a non-GRAPH rule into `graphRules`.
 */

import { describe, expect, it } from "vitest";
import { graphRules, noImportCycles, noUnusedExports } from "../main/index.js";

describe("rules-graph registry", () => {
  it("exports exactly the 2 GRAPH rules, uniquely id'd", () => {
    expect(graphRules).toHaveLength(2);
    expect([...graphRules].map((r) => r.id).sort()).toEqual([
      "no-import-cycles",
      "no-unused-exports",
    ]);
    expect(new Set(graphRules.map((r) => r.id)).size).toBe(2);
  });

  it("every rule in the registry is tier GRAPH", () => {
    expect(graphRules.every((r) => r.tier === "GRAPH")).toBe(true);
  });

  it("each named export is one of the 2 GRAPH rules and carries an `analyze` pass", () => {
    for (const r of [noImportCycles, noUnusedExports]) {
      expect(r.tier).toBe("GRAPH");
      expect(typeof r.analyze).toBe("function");
      expect(graphRules).toContain(r);
    }
  });

  it("preserves each rule's meta (severity / category / fixKind / tags / requires)", () => {
    expect(noImportCycles.severity).toBe("error");
    expect(noImportCycles.category).toBe("Module Boundaries & Architecture");
    expect(noImportCycles.fixKind).toBe("manual");
    expect(noImportCycles.tags).toEqual(["architecture"]);
    expect(noImportCycles.requires).toBeUndefined();

    expect(noUnusedExports.severity).toBe("warning");
    expect(noUnusedExports.category).toBe("Dead Code & Unused Exports");
    expect(noUnusedExports.fixKind).toBe("manual");
    expect(noUnusedExports.tags).toEqual(["dead-code"]);
    expect(noUnusedExports.requires).toEqual(["app"]);
  });
});

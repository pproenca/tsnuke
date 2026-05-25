/**
 * Registry contract + GRAPH-deferral guard for the module-boundaries slice.
 *
 * `no-import-cycles` (tier GRAPH, RULE-015) is deliberately NOT migrated here — it
 * needs the module-graph builder (`core/src/module-graph.ts`) + a GRAPH driver, which
 * land in a later batch. This test makes that deferral EXECUTABLE (not just prose), so a
 * future batch can't silently half-wire a GRAPH rule into the SYN registry before its
 * driver exists (architecture review).
 */

import { describe, expect, it } from "vitest";
import {
  moduleBoundariesRules,
  noDeepRelativeImport,
  noDefaultExport,
  publicApiMustBeExplicit,
} from "../main/index.js";

describe("module-boundaries registry — GRAPH deferral guard", () => {
  it("exports exactly the 3 SYN rules, uniquely id'd", () => {
    expect(moduleBoundariesRules).toHaveLength(3);
    expect([...moduleBoundariesRules].map((r) => r.id).sort()).toEqual([
      "no-deep-relative-import",
      "no-default-export",
      "public-api-must-be-explicit",
    ]);
    expect(new Set(moduleBoundariesRules.map((r) => r.id)).size).toBe(3);
  });

  it("contains NO GRAPH-tier rule (no-import-cycles deferred to the module-graph batch)", () => {
    expect(moduleBoundariesRules.every((r) => r.tier === "SYN")).toBe(true);
    expect(moduleBoundariesRules.some((r) => r.id === "no-import-cycles")).toBe(false);
  });

  it("each named export is one of the 3 SYN rules", () => {
    for (const r of [noDeepRelativeImport, noDefaultExport, publicApiMustBeExplicit]) {
      expect(r.tier).toBe("SYN");
      expect(moduleBoundariesRules).toContain(r);
    }
  });
});

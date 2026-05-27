/**
 * Tests for the GLOBAL rule registry aggregator.
 *
 * These assertions pin the catalog invariants the engine relies on:
 *   - the exact 96 + 2 = 98 tally (a missing/extra slice import would change it);
 *   - GLOBALLY-UNIQUE rule ids across BOTH registries (a duplicate id would double-count
 *     a rule or shadow another — the load-bearing correctness invariant);
 *   - clean tier partitioning (`ruleRegistry` = SYN/TYP/CFG only; `graphRuleRegistry` =
 *     GRAPH only) with per-tier counts matching the catalog;
 *   - the structural shape of every entry (required `RuleMeta` fields + the tier-specific
 *     driver function: `create` for per-file rules, `analyze` for graph rules);
 *   - a spot-check that specific known ids survived aggregation.
 */

import { describe, expect, it } from "vitest";
import type { Tier } from "@tsnuke/contracts-effect";

import {
  graphRuleRegistry,
  ruleRegistry,
  totalRuleCount,
} from "../main/index.js";

// --- Catalog tally ---------------------------------------------------------

describe("catalog tally", () => {
  it("ruleRegistry has exactly 96 per-file rules", () => {
    expect(ruleRegistry).toHaveLength(96);
  });

  it("graphRuleRegistry has exactly 2 GRAPH rules", () => {
    expect(graphRuleRegistry).toHaveLength(2);
  });

  it("combined catalog is exactly 98 rules", () => {
    expect(ruleRegistry.length + graphRuleRegistry.length).toBe(98);
  });

  it("totalRuleCount helper reports the combined 98", () => {
    expect(totalRuleCount).toBe(98);
  });
});

// --- Globally-unique ids (the load-bearing invariant) ----------------------

describe("globally-unique rule ids", () => {
  const allRules = [...ruleRegistry, ...graphRuleRegistry];

  it("has no id collision across BOTH registries (set size === total)", () => {
    const ids = allRules.map((r) => r.id);
    const uniqueIds = new Set(ids);
    // If this fails, surface exactly which ids collided so the dup is actionable.
    const seen = new Set<string>();
    const dups = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(dups, `duplicate rule ids: ${[...new Set(dups)].join(", ")}`).toEqual(
      [],
    );
    expect(uniqueIds.size).toBe(allRules.length);
    expect(uniqueIds.size).toBe(98);
  });

  it("every id is a non-empty string", () => {
    for (const rule of allRules) {
      expect(typeof rule.id).toBe("string");
      expect(rule.id.length).toBeGreaterThan(0);
    }
  });
});

// --- Tier partitioning -----------------------------------------------------

describe("tier partitioning", () => {
  it("ruleRegistry contains only SYN/TYP/CFG (NO GRAPH)", () => {
    for (const rule of ruleRegistry) {
      expect(rule.tier).not.toBe("GRAPH");
      expect(["SYN", "TYP", "CFG"]).toContain(rule.tier);
    }
  });

  it("graphRuleRegistry contains only GRAPH", () => {
    for (const rule of graphRuleRegistry) {
      expect(rule.tier).toBe("GRAPH");
    }
  });

  it("per-tier counts match the catalog (CFG 4, SYN 74, TYP 18, GRAPH 2)", () => {
    const tierCount = (rules: ReadonlyArray<{ tier: Tier }>): Record<string, number> => {
      const counts: Record<string, number> = {};
      for (const r of rules) counts[r.tier] = (counts[r.tier] ?? 0) + 1;
      return counts;
    };

    const perFile = tierCount(ruleRegistry);
    expect(perFile["CFG"]).toBe(4);
    expect(perFile["SYN"]).toBe(74);
    expect(perFile["TYP"]).toBe(18);
    expect(perFile["GRAPH"]).toBeUndefined();

    const graph = tierCount(graphRuleRegistry);
    expect(graph["GRAPH"]).toBe(2);
    expect(graph["SYN"]).toBeUndefined();
    expect(graph["TYP"]).toBeUndefined();
    expect(graph["CFG"]).toBeUndefined();
  });
});

// --- Structural shape ------------------------------------------------------

describe("structural shape", () => {
  const REQUIRED_META = ["id", "severity", "category", "tier"] as const;

  it("every per-file rule has the required RuleMeta fields + a create() factory", () => {
    for (const rule of ruleRegistry) {
      for (const field of REQUIRED_META) {
        expect(rule, `rule ${rule.id} missing ${field}`).toHaveProperty(field);
        expect(
          (rule satisfies Record<string, unknown>)[field],
          `rule ${rule.id}.${field} is undefined`,
        ).toBeDefined();
      }
      expect(typeof rule.create, `rule ${rule.id} missing create()`).toBe(
        "function",
      );
    }
  });

  it("every graph rule has the required RuleMeta fields + an analyze() function", () => {
    for (const rule of graphRuleRegistry) {
      for (const field of REQUIRED_META) {
        expect(rule, `graph rule ${rule.id} missing ${field}`).toHaveProperty(
          field,
        );
        expect(
          (rule satisfies Record<string, unknown>)[field],
          `graph rule ${rule.id}.${field} is undefined`,
        ).toBeDefined();
      }
      expect(typeof rule.analyze, `graph rule ${rule.id} missing analyze()`).toBe(
        "function",
      );
    }
  });
});

// --- Spot-check known ids --------------------------------------------------

describe("spot-check known ids survived aggregation", () => {
  const perFileIds = new Set(ruleRegistry.map((r) => r.id));
  const graphIds = new Set(graphRuleRegistry.map((r) => r.id));

  it.each([
    ["enable-strict", "CFG strictness (rules-core)"],
    ["no-explicit-any", "type-safety"],
    ["no-floating-promises", "async"],
    ["triple-equals", "naming-idioms"],
  ])("ruleRegistry contains %s (%s)", (id) => {
    expect(perFileIds.has(id)).toBe(true);
  });

  it("graphRuleRegistry contains no-import-cycles", () => {
    expect(graphIds.has("no-import-cycles")).toBe(true);
  });
});

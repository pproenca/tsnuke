/**
 * Characterization — the GRAPH-tier substrate (`defineGraphRule` /
 * `createGraphRuleContext`) + the `ModuleGraph` contract owned by this slice.
 *
 * `createGraphRuleContext.report` shares the SAME auto-fill + conditional-spread as
 * `createRuleContext.report` (legacy `define-rule.ts:130-157`), but its context
 * exposes the whole `graph` (not a single sourceFile). `defineGraphRule` attaches
 * an `analyze(ctx)` pass (vs `create(ctx)` for per-file rules).
 */

import { describe, expect, it } from "vitest";
import type { Diagnostic, RuleMeta } from "@ts-fix/contracts-effect";
import {
  defineGraphRule,
  createGraphRuleContext,
} from "../main/index.js";
import type { ModuleGraph } from "../main/index.js";

const META: RuleMeta = {
  id: "no-cycle",
  severity: "error",
  category: "Module Graph",
  tier: "GRAPH",
};

const EMPTY_GRAPH: ModuleGraph = {
  files: [],
  imports: new Map(),
  exports: new Map(),
  usedExports: new Map(),
  wildcardUsed: new Set(),
};

describe("createGraphRuleContext.report — auto-fill (mirrors createRuleContext)", () => {
  function capture(): Diagnostic {
    const out: Diagnostic[] = [];
    const ctx = createGraphRuleContext(META, {
      graph: EMPTY_GRAPH,
      sink: (d) => out.push(d),
    });
    expect(ctx.graph).toBe(EMPTY_GRAPH);
    ctx.report({
      filePath: "src/a.ts",
      message: "cycle a -> b -> a",
      help: "break the cycle",
      line: 1,
      column: 1,
    });
    expect(out).toHaveLength(1);
    return out[0]!;
  }

  it("forces plugin and defaults the meta-derived fields", () => {
    const d = capture();
    expect(d.plugin).toBe("ts-fix");
    expect(d.rule).toBe("no-cycle");
    expect(d.tier).toBe("GRAPH");
    expect(d.category).toBe("Module Graph");
    expect(d.severity).toBe("error");
  });

  it("omits absent optionals (exactOptional spread)", () => {
    const d = capture();
    expect(d).not.toHaveProperty("url");
    expect(d).not.toHaveProperty("fix");
    expect(d).not.toHaveProperty("suppressionHint");
  });

  it("honors overrides for rule/tier/category/severity", () => {
    const out: Diagnostic[] = [];
    const ctx = createGraphRuleContext(META, {
      graph: EMPTY_GRAPH,
      sink: (d) => out.push(d),
    });
    ctx.report({
      filePath: "x.ts",
      message: "m",
      help: "h",
      line: 2,
      column: 3,
      severity: "warning",
      tier: "SYN",
      rule: "override",
      category: "Other",
    });
    expect(out[0]).toMatchObject({
      severity: "warning",
      tier: "SYN",
      rule: "override",
      category: "Other",
    });
  });
});

describe("defineGraphRule", () => {
  it("returns meta + an analyze() pass (not create())", () => {
    const seen: string[] = [];
    const rule = defineGraphRule(META, (ctx) => {
      for (const f of ctx.graph.files) seen.push(f);
    });
    expect(rule.id).toBe("no-cycle");
    expect(rule.tier).toBe("GRAPH");
    expect(typeof rule.analyze).toBe("function");
    expect(rule).not.toHaveProperty("create");

    rule.analyze(
      createGraphRuleContext(META, {
        graph: { ...EMPTY_GRAPH, files: ["a.ts", "b.ts"] },
        sink: () => {},
      }),
    );
    expect(seen).toEqual(["a.ts", "b.ts"]);
  });
});

describe("ModuleGraph — the contract shape owned by this slice", () => {
  it("models files/imports/exports/usedExports/wildcardUsed", () => {
    const g: ModuleGraph = {
      files: ["a.ts", "b.ts"],
      imports: new Map([["a.ts", ["b.ts"]]]),
      exports: new Map([["b.ts", ["foo", "default"]]]),
      usedExports: new Map([["b.ts", new Set(["foo"])]]),
      wildcardUsed: new Set(["b.ts"]),
    };
    expect(g.files).toHaveLength(2);
    expect(g.imports.get("a.ts")).toEqual(["b.ts"]);
    expect(g.exports.get("b.ts")).toContain("default");
    expect(g.usedExports.get("b.ts")?.has("foo")).toBe(true);
    expect(g.wildcardUsed.has("b.ts")).toBe(true);
  });
});

/**
 * Tests for the Tier-1 (SYN) AST rule driver `runRule` — the shared walk/dispatch the
 * rule-category slices (and the engine) use to execute a rule's visitors over a snippet.
 */

import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  defineGraphRule,
  defineRule,
  runGraphRule,
  runRule,
  runTypeAwareRule,
} from "../main/index.js";
import type { ModuleGraph } from "../main/index.js";

describe("runRule (SYN AST driver)", () => {
  it("dispatches a kind visitor for each matching node and collects diagnostics", () => {
    const rule = defineRule(
      { id: "test-stmt", severity: "warning", category: "Test", tier: "SYN" },
      () => ({
        [ts.SyntaxKind.VariableStatement]: (_node, ctx) => {
          ctx.report({ filePath: ctx.filePath, message: "stmt", help: "h", line: 1, column: 1 });
        },
      }),
    );
    const out = runRule(rule, "const a = 1;\nconst b = 2;");
    expect(out).toHaveLength(2);
    expect(out[0]?.plugin).toBe("tsnuke"); // forced by createRuleContext
    expect(out[0]?.rule).toBe("test-stmt"); // defaulted from meta.id
  });

  it("fires a SourceFile-keyed visitor exactly once (whole-file / comment rules)", () => {
    let fired = 0;
    const rule = defineRule(
      { id: "test-file", severity: "warning", category: "Test", tier: "SYN" },
      () => ({
        [ts.SyntaxKind.SourceFile]: (_node, ctx) => {
          fired++;
          ctx.report({ filePath: ctx.filePath, message: "file", help: "h", line: 1, column: 1 });
        },
      }),
    );
    const out = runRule(rule, "const a = 1;\nconst b = 2;");
    expect(fired).toBe(1);
    expect(out).toHaveLength(1);
  });

  it("returns [] for an AST-free rule (no visitors, e.g. the CFG strictness rules)", () => {
    const rule = defineRule(
      { id: "test-empty", severity: "warning", category: "Test", tier: "CFG" },
      () => ({}),
    );
    expect(runRule(rule, "const a = 1;")).toHaveLength(0);
  });
});

describe("runTypeAwareRule (TYP driver — supplies a ts.TypeChecker)", () => {
  // A TYP rule that early-returns without a checker (the standard pattern) and, with one,
  // resolves a type — proving runTypeAwareRule wires a live checker that the SYN path lacks.
  const typRule = defineRule(
    { id: "test-typ", severity: "warning", category: "Test", tier: "TYP" },
    () => ({
      [ts.SyntaxKind.VariableDeclaration]: (node, ctx) => {
        if (ctx.checker === undefined) return; // SYN path: no checker → skip (TYP convention)
        if (!ts.isVariableDeclaration(node)) return;
        const type = ctx.checker.getTypeAtLocation(node.name);
        ctx.report({
          filePath: ctx.filePath,
          message: ctx.checker.typeToString(type),
          help: "h",
          line: 1,
          column: 1,
        });
      },
    }),
  );

  it("provides ctx.checker so a TYP rule can resolve types", () => {
    const out = runTypeAwareRule(typRule, "const n = 1 + 1;");
    expect(out).toHaveLength(1);
    expect(out[0]?.message).toBe("number"); // the checker resolved `n`'s type
  });

  it("the SAME TYP rule reports nothing under runRule (no checker on the Tier-1 path)", () => {
    expect(runRule(typRule, "const n = 1 + 1;")).toHaveLength(0);
  });
});

describe("runGraphRule (GRAPH driver — whole-graph analyze)", () => {
  const graph = (files: string[], imports: Array<[string, string[]]>): ModuleGraph => ({
    files,
    imports: new Map(imports),
    exports: new Map(),
    usedExports: new Map(),
    wildcardUsed: new Set(),
  });

  it("runs a GraphRule's analyze pass over the graph and collects its diagnostics", () => {
    const rule = defineGraphRule(
      { id: "test-graph", severity: "error", category: "Test", tier: "GRAPH" },
      (ctx) => {
        for (const f of ctx.graph.files) {
          ctx.report({ filePath: f, message: "g", help: "h", line: 1, column: 1 });
        }
      },
    );
    const out = runGraphRule(rule, graph(["/a.ts", "/b.ts"], []));
    expect(out).toHaveLength(2);
    expect(out[0]?.plugin).toBe("tsnuke"); // forced
    expect(out[0]?.tier).toBe("GRAPH"); // defaulted from meta
    expect(out.map((d) => d.filePath)).toEqual(["/a.ts", "/b.ts"]);
  });
});

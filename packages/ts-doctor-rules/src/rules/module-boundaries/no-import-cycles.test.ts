import { describe, expect, it } from "vitest";
import { rule } from "./no-import-cycles.js";
import { createGraphRuleContext } from "../../define-rule.js";
import type { Diagnostic, ModuleGraph } from "../../index.js";

function run(graph: ModuleGraph): Diagnostic[] {
  const collected: Diagnostic[] = [];
  const ctx = createGraphRuleContext(rule, { graph, sink: (d) => collected.push(d) });
  rule.analyze(ctx);
  return collected;
}

describe("no-import-cycles (GRAPH)", () => {
  it("flags a 2-module cycle", () => {
    const graph: ModuleGraph = {
      files: ["/a.ts", "/b.ts"],
      imports: new Map([
        ["/a.ts", ["/b.ts"]],
        ["/b.ts", ["/a.ts"]],
      ]),
      exports: new Map(),
      usedExports: new Map(),
      wildcardUsed: new Set(),
    };
    const diags = run(graph);
    expect(diags.length).toBeGreaterThanOrEqual(1);
    expect(diags[0]!.tier).toBe("GRAPH");
    expect(diags[0]!.rule).toBe("no-import-cycles");
  });

  it("does not flag an acyclic graph", () => {
    const graph: ModuleGraph = {
      files: ["/a.ts", "/b.ts", "/c.ts"],
      imports: new Map([
        ["/a.ts", ["/b.ts", "/c.ts"]],
        ["/b.ts", ["/c.ts"]],
        ["/c.ts", []],
      ]),
      exports: new Map(),
      usedExports: new Map(),
      wildcardUsed: new Set(),
    };
    expect(run(graph)).toHaveLength(0);
  });
});

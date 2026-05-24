import { describe, expect, it } from "vitest";
import { rule } from "./no-unused-exports.js";
import { createGraphRuleContext } from "../../define-rule.js";
import type { Diagnostic, ModuleGraph } from "../../index.js";

function run(graph: ModuleGraph): Diagnostic[] {
  const collected: Diagnostic[] = [];
  rule.analyze(createGraphRuleContext(rule, { graph, sink: (d) => collected.push(d) }));
  return collected;
}

describe("no-unused-exports (GRAPH)", () => {
  it("flags an exported name nothing imports (in a referenced module)", () => {
    // main.ts imports { used } from util.ts; util exports used + unused.
    const graph: ModuleGraph = {
      files: ["/main.ts", "/util.ts"],
      imports: new Map([
        ["/main.ts", ["/util.ts"]],
        ["/util.ts", []],
      ]),
      exports: new Map([
        ["/main.ts", []],
        ["/util.ts", ["used", "unused"]],
      ]),
      usedExports: new Map([["/util.ts", new Set(["used"])]]),
      wildcardUsed: new Set(),
    };
    const diags = run(graph);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-unused-exports");
    expect(diags[0]!.tier).toBe("GRAPH");
    expect(diags[0]!.message).toContain("unused");
  });

  it("does not flag exports of an unreferenced (entry/root) file", () => {
    const graph: ModuleGraph = {
      files: ["/main.ts"],
      imports: new Map([["/main.ts", []]]),
      exports: new Map([["/main.ts", ["whatever"]]]),
      usedExports: new Map(),
      wildcardUsed: new Set(),
    };
    expect(run(graph)).toHaveLength(0);
  });

  it("exempts namespace/wildcard-used files", () => {
    const graph: ModuleGraph = {
      files: ["/main.ts", "/util.ts"],
      imports: new Map([
        ["/main.ts", ["/util.ts"]],
        ["/util.ts", []],
      ]),
      exports: new Map([["/util.ts", ["a", "b"]]]),
      usedExports: new Map(),
      wildcardUsed: new Set(["/util.ts"]),
    };
    expect(run(graph)).toHaveLength(0);
  });
});

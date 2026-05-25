/**
 * Characterization tests for `no-import-cycles` (GRAPH, RULE-015) — the equivalence proof.
 *
 * The legacy `no-import-cycles.test.ts` vectors ARE the behavioral spec, so they are ported
 * verbatim (2-module cycle, acyclic → none) and supplemented with the brief's explicit asks
 * (3-module cycle, self-loop, a node in two cycles reported once) plus full-shape assertions.
 *
 * Driven through the REAL `runGraphRule` from `@tsnuke/rules-core-effect` (the same
 * `createGraphRuleContext` + `analyze(ctx)` pass the engine uses on the GRAPH path) over
 * hand-built `ModuleGraph` fixtures — so the equivalence holds for the production driver, not
 * a test-only harness. `requires`/activation gating is the engine / `shouldActivate`'s job,
 * NOT the rule's `analyze`, so these run `analyze` directly with no gating.
 */

import { describe, expect, it } from "vitest";
import { runGraphRule } from "@tsnuke/rules-core-effect";
import type { ModuleGraph } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-import-cycles.js";

/** Build a `ModuleGraph` with just `files` + `imports` (the only fields this rule reads). */
function graphOf(
  files: readonly string[],
  imports: ReadonlyArray<readonly [string, readonly string[]]>,
): ModuleGraph {
  return {
    files,
    imports: new Map(imports),
    exports: new Map(),
    usedExports: new Map(),
    wildcardUsed: new Set(),
  };
}

describe("no-import-cycles (GRAPH) — RULE-015", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

  it("flags a 2-module cycle", () => {
    const graph = graphOf(
      ["/a.ts", "/b.ts"],
      [
        ["/a.ts", ["/b.ts"]],
        ["/b.ts", ["/a.ts"]],
      ],
    );
    const diags = runGraphRule(rule, graph);
    expect(diags.length).toBeGreaterThanOrEqual(1);
    expect(diags[0]!.tier).toBe("GRAPH");
    expect(diags[0]!.rule).toBe("no-import-cycles");
  });

  it("does not flag an acyclic graph", () => {
    const graph = graphOf(
      ["/a.ts", "/b.ts", "/c.ts"],
      [
        ["/a.ts", ["/b.ts", "/c.ts"]],
        ["/b.ts", ["/c.ts"]],
        ["/c.ts", []],
      ],
    );
    expect(runGraphRule(rule, graph)).toHaveLength(0);
  });

  // --- Added: full diagnostic shape (legacy asserted only tier + rule) ---

  it("reports the full diagnostic for a 2-module cycle (back-edge target at line 1)", () => {
    // DFS starts at /a.ts (GRAY), descends to /b.ts (GRAY); /b.ts → /a.ts is a back-edge,
    // so /a.ts (still GRAY) is the cycle-closing target and is reported once at line 1.
    const graph = graphOf(
      ["/a.ts", "/b.ts"],
      [
        ["/a.ts", ["/b.ts"]],
        ["/b.ts", ["/a.ts"]],
      ],
    );
    const diags = runGraphRule(rule, graph);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-import-cycles");
    expect(d.tier).toBe("GRAPH");
    expect(d.severity).toBe("error");
    expect(d.category).toBe("Module Boundaries & Architecture");
    expect(d.plugin).toBe("tsnuke");
    expect(d.filePath).toBe("/a.ts");
    expect(d.message).toBe("Import cycle detected involving /a.ts.");
    expect(d.help).toBe(
      "Circular imports cause fragile init order and break tree-shaking. Extract shared code or invert a dependency.",
    );
    expect(d.line).toBe(1);
    expect(d.column).toBe(1);
  });

  // --- Added: 3-module cycle (brief ask) ---

  it("flags a 3-module cycle (a → b → c → a), reported once at the back-edge target", () => {
    const graph = graphOf(
      ["/a.ts", "/b.ts", "/c.ts"],
      [
        ["/a.ts", ["/b.ts"]],
        ["/b.ts", ["/c.ts"]],
        ["/c.ts", ["/a.ts"]],
      ],
    );
    const diags = runGraphRule(rule, graph);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-import-cycles");
    expect(diags[0]!.tier).toBe("GRAPH");
    // /c.ts → /a.ts closes the cycle; /a.ts is still GRAY on the stack.
    expect(diags[0]!.filePath).toBe("/a.ts");
    expect(diags[0]!.message).toBe("Import cycle detected involving /a.ts.");
  });

  // --- Added: self-loop (brief ask) ---

  it("flags a self-loop (a → a) once", () => {
    const graph = graphOf(["/a.ts"], [["/a.ts", ["/a.ts"]]]);
    const diags = runGraphRule(rule, graph);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.filePath).toBe("/a.ts");
    expect(diags[0]!.message).toBe("Import cycle detected involving /a.ts.");
  });

  // --- Added: a node participating in two cycles is reported ONCE (brief ask) ---

  it("reports a node shared by two cycles exactly once", () => {
    // /a.ts is the hub of two back-edges: b → a and c → a. The `reported` set dedupes /a.ts.
    const graph = graphOf(
      ["/a.ts", "/b.ts", "/c.ts"],
      [
        ["/a.ts", ["/b.ts", "/c.ts"]],
        ["/b.ts", ["/a.ts"]],
        ["/c.ts", ["/a.ts"]],
      ],
    );
    const diags = runGraphRule(rule, graph);
    const aTargets = diags.filter((d) => d.filePath === "/a.ts");
    expect(aTargets).toHaveLength(1);
    expect(aTargets[0]!.message).toBe("Import cycle detected involving /a.ts.");
  });

  // --- Added: empty graph → no diagnostics ---

  it("reports nothing for an empty graph", () => {
    expect(runGraphRule(rule, graphOf([], []))).toHaveLength(0);
  });

  // --- Added: a missing imports entry is treated as no deps (acyclic) ---

  it("treats a file with no imports entry as having no deps (no cycle)", () => {
    const graph = graphOf(["/a.ts", "/b.ts"], [["/a.ts", ["/b.ts"]]]);
    expect(runGraphRule(rule, graph)).toHaveLength(0);
  });
});

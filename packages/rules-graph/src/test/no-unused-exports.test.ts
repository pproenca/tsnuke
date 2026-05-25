/**
 * Characterization tests for `no-unused-exports` (GRAPH, RULE-025 dead-code row) — the
 * equivalence proof.
 *
 * The legacy `no-unused-exports.test.ts` vectors ARE the behavioral spec, so they are ported
 * verbatim (unused name flagged in a referenced module, entry/root file skipped,
 * namespace/wildcard file exempt) and supplemented with the brief's explicit asks (a USED
 * name is not flagged, a re-export counts as used) plus full-shape assertions.
 *
 * Driven through the REAL `runGraphRule` from `@tsnuke/rules-core-effect`. NOTE: the meta
 * carries `requires:["app"]`, but activation gating is the engine / `shouldActivate`'s job
 * (RULE-019), NOT the rule's `analyze` body — so these tests run `analyze` directly with no
 * `app` capability and the rule still produces findings (gating happens upstream of analyze).
 */

import { describe, expect, it } from "vitest";
import { runGraphRule } from "@tsnuke/rules-core-effect";
import type { ModuleGraph } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-unused-exports.js";

describe("no-unused-exports (GRAPH) — RULE-025 (dead-code)", () => {
  // --- Ported legacy behavioral spec (the equivalence proof) ---

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
    const diags = runGraphRule(rule, graph);
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
    expect(runGraphRule(rule, graph)).toHaveLength(0);
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
    expect(runGraphRule(rule, graph)).toHaveLength(0);
  });

  // --- Added: a USED export name is NOT flagged (brief ask) ---

  it("does NOT flag an export name that IS imported by another module", () => {
    const graph: ModuleGraph = {
      files: ["/main.ts", "/util.ts"],
      imports: new Map([
        ["/main.ts", ["/util.ts"]],
        ["/util.ts", []],
      ]),
      exports: new Map([["/util.ts", ["used"]]]),
      usedExports: new Map([["/util.ts", new Set(["used"])]]),
      wildcardUsed: new Set(),
    };
    expect(runGraphRule(rule, graph)).toHaveLength(0);
  });

  // --- Added: a re-export counts as used (brief ask) ---

  it("counts a re-export as a use (re-exported name not flagged)", () => {
    // barrel.ts re-exports { a } from util.ts → `a` appears in util's usedExports; `b` does not.
    const graph: ModuleGraph = {
      files: ["/barrel.ts", "/util.ts"],
      imports: new Map([
        ["/barrel.ts", ["/util.ts"]],
        ["/util.ts", []],
      ]),
      exports: new Map([
        ["/barrel.ts", ["a"]],
        ["/util.ts", ["a", "b"]],
      ]),
      usedExports: new Map([["/util.ts", new Set(["a"])]]),
      wildcardUsed: new Set(),
    };
    const diags = runGraphRule(rule, graph);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.filePath).toBe("/util.ts");
    expect(diags[0]!.message).toBe("Exported `b` is never imported by another module.");
  });

  // --- Added: full diagnostic shape (legacy asserted only rule/tier + message contains) ---

  it("reports the full diagnostic for an unused export (at line 1)", () => {
    const graph: ModuleGraph = {
      files: ["/main.ts", "/util.ts"],
      imports: new Map([
        ["/main.ts", ["/util.ts"]],
        ["/util.ts", []],
      ]),
      exports: new Map([["/util.ts", ["unused"]]]),
      usedExports: new Map(),
      wildcardUsed: new Set(),
    };
    const diags = runGraphRule(rule, graph);
    expect(diags).toHaveLength(1);
    const d = diags[0]!;
    expect(d.rule).toBe("no-unused-exports");
    expect(d.tier).toBe("GRAPH");
    expect(d.severity).toBe("warning");
    expect(d.category).toBe("Dead Code & Unused Exports");
    expect(d.plugin).toBe("tsnuke");
    expect(d.filePath).toBe("/util.ts");
    expect(d.message).toBe("Exported `unused` is never imported by another module.");
    expect(d.help).toBe(
      "Remove the unused export, or relocate it to the package's public entry point.",
    );
    expect(d.line).toBe(1);
    expect(d.column).toBe(1);
  });

  // --- Added: multiple unused names in one referenced file each get a diagnostic ---

  it("flags every unused export name in a referenced module", () => {
    const graph: ModuleGraph = {
      files: ["/main.ts", "/util.ts"],
      imports: new Map([
        ["/main.ts", ["/util.ts"]],
        ["/util.ts", []],
      ]),
      exports: new Map([["/util.ts", ["a", "b", "c"]]]),
      usedExports: new Map([["/util.ts", new Set(["b"])]]),
      wildcardUsed: new Set(),
    };
    const diags = runGraphRule(rule, graph);
    expect(diags.map((d) => d.message).sort()).toEqual([
      "Exported `a` is never imported by another module.",
      "Exported `c` is never imported by another module.",
    ]);
  });

  // --- Added: a referenced file with no exports map entry → no diagnostics ---

  it("reports nothing for a referenced file that has no exports", () => {
    const graph: ModuleGraph = {
      files: ["/main.ts", "/util.ts"],
      imports: new Map([
        ["/main.ts", ["/util.ts"]],
        ["/util.ts", []],
      ]),
      exports: new Map(),
      usedExports: new Map(),
      wildcardUsed: new Set(),
    };
    expect(runGraphRule(rule, graph)).toHaveLength(0);
  });

  // --- Added: `requires:["app"]` is meta-only; analyze runs regardless (gating is upstream) ---

  it("carries `requires:[\"app\"]` in its meta (engine-gated, not enforced in analyze)", () => {
    expect(rule.requires).toEqual(["app"]);
    // analyze still fires here despite no `app` capability — gating is shouldActivate's job.
    const graph: ModuleGraph = {
      files: ["/main.ts", "/util.ts"],
      imports: new Map([
        ["/main.ts", ["/util.ts"]],
        ["/util.ts", []],
      ]),
      exports: new Map([["/util.ts", ["unused"]]]),
      usedExports: new Map(),
      wildcardUsed: new Set(),
    };
    expect(runGraphRule(rule, graph)).toHaveLength(1);
  });
});

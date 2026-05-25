/**
 * `@tsnuke/rules-graph-effect` — the GRAPH-tier rules.
 *
 * Two pure plain-TS graph predicates that plug into the `@tsnuke/rules-core-effect`
 * substrate (`defineGraphRule` + the whole-graph `analyze(ctx)` shape); the engine drives
 * them via the SAME `analyze` pass as `runGraphRule`:
 *   - {@link noImportCycles} (RULE-015) — circular import dependencies, found with an
 *     iterative tri-color (WHITE/GRAY/BLACK) DFS over the cross-file `ModuleGraph`; each
 *     cycle-closing file reported once at line 1.
 *   - {@link noUnusedExports} (RULE-025, dead-code row) — an exported name no other
 *     in-project module imports; gated `requires:["app"]`; exempts unreferenced root/entry
 *     files and namespace/wildcard/dynamically-used files.
 *
 * Unlike SYN/TYP rules these do NOT walk a single file's AST and never touch the TS
 * compiler API — they reason about the cross-file `ModuleGraph` core builds, so they have
 * the distinct `GraphRule` shape (`analyze` over a graph, not a `SyntaxKind → visitor` map).
 *
 * The substrate (`defineGraphRule` / `GraphRule` / `runGraphRule`) is imported from
 * `@tsnuke/rules-core-effect`; the data contracts (`Diagnostic` / `RuleMeta`) live in
 * `@tsnuke/contracts-effect`. This slice does NOT re-export either's symbols (barrel
 * hygiene — it publishes only what it owns: the two rules + the graph registry).
 */

import type { GraphRule } from "@tsnuke/rules-core-effect";

import { rule as noImportCycles } from "./no-import-cycles.js";
import { rule as noUnusedExports } from "./no-unused-exports.js";

// The two GRAPH rules, exported by stable name.
export { noImportCycles, noUnusedExports };

/**
 * The GRAPH-tier rule registry (RULE-015 `no-import-cycles` + RULE-025 dead-code
 * `no-unused-exports`). The full-catalog codegen (legacy
 * `scripts/generate-rule-registry.mjs`) folds `defineGraphRule(` call sites into the
 * global `graphRuleRegistry` (separate from the SYN/TYP `ruleRegistry`); here the list is
 * hand-written, mirroring the v1 manual-registry seam in rules-core.
 */
export const graphRules: ReadonlyArray<GraphRule> = [noImportCycles, noUnusedExports];

// Self-barrel: `import { RulesGraph } from "@tsnuke/rules-graph-effect"`
// resolves to this module's namespace. Additive — the named exports above stay the surface.
export * as RulesGraph from "./index.js";

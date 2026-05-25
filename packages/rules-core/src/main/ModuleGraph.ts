/**
 * The cross-file module graph that GRAPH-tier rules analyze.
 *
 * OWNED by the rules domain (this slice), NOT by `@ts-doctor/contracts-effect`: it
 * is a single-site GRAPH-tier INPUT (built by core from resolved in-project edges)
 * consumed only by graph rules — there is no cross-slice duplication to consolidate,
 * so it stays here rather than in the shared contracts package (per the contracts
 * package's own note: "`ModuleGraph` (GRAPH-tier input, not duplicated across slices)"
 * is explicitly NOT modeled there).
 *
 * Modeled as a plain `interface` (not an `effect/Schema`): it is an in-memory
 * structure assembled by core, never decoded at a trust boundary, and its `Map`/`Set`
 * members are not naturally Schema-shaped. Faithful port of the `ModuleGraph` from
 * legacy `packages/ts-doctor-rules/src/types.ts`. Structural (no checker).
 */
export interface ModuleGraph {
  /** All analyzed file paths (absolute). */
  readonly files: readonly string[];
  /** filePath → the in-project file paths it imports from (resolved edges). */
  readonly imports: ReadonlyMap<string, readonly string[]>;
  /** filePath → names it exports (named exports + `"default"`). */
  readonly exports: ReadonlyMap<string, readonly string[]>;
  /** filePath → names that OTHER files import from it (usage). */
  readonly usedExports: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * Files that are namespace-imported (`import * as ns`), wildcard re-exported
   * (`export *`), or dynamically imported — ALL their exports count as used
   * (we can't statically attribute individual names), so they're exempt from
   * unused-export analysis.
   */
  readonly wildcardUsed: ReadonlySet<string>;
}

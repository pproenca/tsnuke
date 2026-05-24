/**
 * Producer-side domain types owned and exported by `@ts-doctor/rules`.
 *
 * These are the contract that `@ts-doctor/core` (and downstream consumers)
 * import via `import type`. They model what a rule *produces* — diagnostics,
 * fixes, and the metadata that drives capability-gated activation. Project
 * discovery / report-aggregation types live in core, not here.
 *
 * See AI_NATIVE_SPEC.md §2 (domain model) and REIMAGINED_ARCHITECTURE.md §3.1.
 */

/** Diagnostic severity. ts-doctor v1 has no "info" level (kept parity with legacy). */
export type Severity = "error" | "warning";

/**
 * The analysis tier that produced a diagnostic (BC-10).
 * - SYN: syntactic, AST-only (always available)
 * - TYP: type-aware, requires `typecheck:ok` + the `ts.TypeChecker`
 * - GRAPH: module-graph rules (cycles, unused exports)
 * - CFG: project-level config rules (tsconfig strictness gaps)
 */
export type Tier = "SYN" | "TYP" | "GRAPH" | "CFG";

/** How a diagnostic can be remediated. */
export type FixKind = "auto-fix" | "codemod" | "manual";

/** A single text replacement over a source file, by half-open `[start, end)` char offsets. */
export interface TextEdit {
  /** Inclusive start char offset into the source file. */
  start: number;
  /** Exclusive end char offset into the source file. */
  end: number;
  /** Text to splice in over `[start, end)`. */
  replacement: string;
}

/** A structured, machine-applicable remediation (BC-14). */
export interface Fix {
  kind: FixKind;
  edits: TextEdit[];
  /** TYP rules only: the type the checker inferred at the fix site. */
  inferredType?: string;
}

/** One finding emitted by a rule. Carries deterministic identity inputs + a tier tag (BC-10/BC-13). */
export interface Diagnostic {
  filePath: string;
  /** Always `"ts-doctor"` in v1 (first-party catalog only). */
  plugin: string;
  /** The rule id that produced this diagnostic. */
  rule: string;
  severity: Severity;
  message: string;
  help: string;
  /** Optional docs link for this rule. */
  url?: string;
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column: number;
  category: string;
  tier: Tier;
  fix?: Fix;
  /** Set when a near-miss inline-disable directive was found (BC-12). */
  suppressionHint?: string;
}

/**
 * A single capability token in the project's `Set<string>`.
 * Examples: `"ts:5.8"`, `"strict"`, `"lib"`, `"typecheck:ok"`, `"noUncheckedIndexedAccess"`.
 */
export type Capability = string;

/**
 * The cross-file module graph GRAPH-tier rules analyze (cycles, layering,
 * unused exports, …). Built by core from resolved in-project edges; structural
 * (no checker).
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

/** Rule metadata: the static, declarative half of a rule that drives activation + presets. */
export interface RuleMeta {
  /** Stable public id, e.g. `"no-ts-ignore"`. Frozen contract (NFR forward-compat). */
  id: string;
  severity: Severity;
  /** Category name; the codegen registry derives this from the rule's directory. */
  category: string;
  tier: Tier;
  /** ALL of these must be present in the capability set for the rule to activate (BC-08). */
  requires?: readonly Capability[];
  /** ANY of these present in the capability set disables the rule (BC-08, inverted gating BC-09). */
  disabledBy?: readonly Capability[];
  /** Tags an ignore list can target (BC-08). */
  tags?: readonly string[];
  /** When `false`, the rule is opt-in: it activates only under an explicit severity override (BC-08). */
  defaultEnabled?: boolean;
  fixKind?: FixKind;
  /**
   * Project-level finding message. CFG rules don't walk a file AST — when one
   * activates, core emits a single project-level diagnostic carrying this message
   * (falling back to `recommendation`). Per-file (SYN/TYP/GRAPH) rules set their
   * message at `report()` time and leave this undefined.
   */
  message?: string;
  /** Static, offline `--explain` text rendered by the CLI (no model call). */
  recommendation?: string;
}

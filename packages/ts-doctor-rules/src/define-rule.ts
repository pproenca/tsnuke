import ts from "typescript";
import type { Diagnostic, ModuleGraph, RuleMeta } from "./types.js";

/** The plugin name every ts-doctor diagnostic carries (first-party catalog only — BC-18). */
export const PLUGIN_NAME = "ts-doctor" as const;

/**
 * The fields a rule must (or may) supply to `report`. The context auto-fills
 * `plugin` (always `"ts-doctor"`) and the rule's `rule`/`tier`/`category`/`severity`
 * from its meta, so a rule typically only provides position + message + help.
 * A rule may still override any auto-filled field (e.g. downgrade `severity`).
 */
export type ReportInput = Omit<
  Diagnostic,
  "plugin" | "rule" | "tier" | "category" | "severity"
> &
  Partial<Pick<Diagnostic, "rule" | "tier" | "category" | "severity">>;

/** Everything a rule visitor needs to inspect a source file and emit findings. */
export interface RuleContext {
  /** The parsed source file under analysis. */
  readonly sourceFile: ts.SourceFile;
  /**
   * The type checker — present only for Tier-2 (TYP) rules running under
   * `typecheck:ok`. Undefined on the Tier-1 / broken-project path (BC-10).
   */
  readonly checker?: ts.TypeChecker;
  /** Absolute path of the file under analysis. */
  readonly filePath: string;
  /**
   * Emit a diagnostic. `plugin` is forced to `"ts-doctor"`; `rule`/`tier`/
   * `category`/`severity` default from the rule's meta but may be overridden.
   */
  report(input: ReportInput): void;
}

/** A map from a `ts.SyntaxKind` to the callback invoked for each matching node. */
export type RuleVisitors = {
  [K in ts.SyntaxKind]?: (node: ts.Node, ctx: RuleContext) => void;
};

/** A fully-assembled rule: static metadata plus a per-file visitor factory. */
export type Rule = RuleMeta & {
  /** Build the per-file visitor set. Called once per source file. */
  create(ctx: RuleContext): RuleVisitors;
};

/**
 * Construct a {@link RuleContext} that auto-fills `plugin` and the meta-derived
 * fields. Core uses this when driving rule visitors; rules use the resulting
 * `ctx.report` to emit findings. Exposed so the engine in core builds contexts
 * consistently with what rules expect.
 */
export function createRuleContext(
  meta: RuleMeta,
  args: {
    sourceFile: ts.SourceFile;
    filePath: string;
    checker?: ts.TypeChecker;
    sink: (d: Diagnostic) => void;
  },
): RuleContext {
  const { sourceFile, filePath, checker, sink } = args;
  return {
    sourceFile,
    filePath,
    // exactOptionalPropertyTypes: only set `checker` when actually present.
    ...(checker !== undefined ? { checker } : {}),
    report(input: ReportInput): void {
      // Build the meta-derived base, then apply only the overrides that are
      // actually present. This keeps `severity`/`tier`/`category`/`rule`
      // strongly non-optional under exactOptionalPropertyTypes — a `Partial`
      // spread would widen them to `T | undefined`.
      sink({
        plugin: PLUGIN_NAME,
        rule: input.rule ?? meta.id,
        tier: input.tier ?? meta.tier,
        category: input.category ?? meta.category,
        severity: input.severity ?? meta.severity,
        filePath: input.filePath,
        message: input.message,
        help: input.help,
        line: input.line,
        column: input.column,
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.fix !== undefined ? { fix: input.fix } : {}),
        ...(input.suppressionHint !== undefined
          ? { suppressionHint: input.suppressionHint }
          : {}),
      });
    },
  };
}

/**
 * Define a rule. Returns a {@link Rule} = metadata + a `create` visitor factory.
 *
 * The codegen registry scans for `defineRule(` call sites (see
 * `scripts/generate-rule-registry.mjs`); keep this call shape stable.
 */
export function defineRule(
  meta: RuleMeta,
  create: (ctx: RuleContext) => RuleVisitors,
): Rule {
  return { ...meta, create };
}

// ---------------------------------------------------------------------------
// GRAPH tier — module-graph rules (cycles, layering). These do NOT walk a single
// file's AST; they analyze the cross-file {@link ModuleGraph} core builds, so
// they have a distinct shape and live in a separate `graphRuleRegistry`.
// ---------------------------------------------------------------------------

/** Context a GRAPH rule receives: the whole module graph + a report sink. */
export interface GraphRuleContext {
  readonly graph: ModuleGraph;
  /** Emit a graph-level finding (`filePath` is the file the finding pins to). */
  report(input: ReportInput): void;
}

/** A GRAPH-tier rule: metadata + a whole-graph analysis pass. */
export type GraphRule = RuleMeta & {
  analyze(ctx: GraphRuleContext): void;
};

/**
 * Build a {@link GraphRuleContext} that auto-fills `plugin` + meta-derived fields,
 * mirroring {@link createRuleContext}. Core uses this to drive graph rules.
 */
export function createGraphRuleContext(
  meta: RuleMeta,
  args: { graph: ModuleGraph; sink: (d: Diagnostic) => void },
): GraphRuleContext {
  const { graph, sink } = args;
  return {
    graph,
    report(input: ReportInput): void {
      sink({
        plugin: PLUGIN_NAME,
        rule: input.rule ?? meta.id,
        tier: input.tier ?? meta.tier,
        category: input.category ?? meta.category,
        severity: input.severity ?? meta.severity,
        filePath: input.filePath,
        message: input.message,
        help: input.help,
        line: input.line,
        column: input.column,
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.fix !== undefined ? { fix: input.fix } : {}),
        ...(input.suppressionHint !== undefined
          ? { suppressionHint: input.suppressionHint }
          : {}),
      });
    },
  };
}

/**
 * Define a GRAPH-tier rule. The codegen scans for `defineGraphRule(` call sites
 * and collects these into `graphRuleRegistry` (separate from `ruleRegistry`).
 */
export function defineGraphRule(
  meta: RuleMeta,
  analyze: (ctx: GraphRuleContext) => void,
): GraphRule {
  return { ...meta, analyze };
}

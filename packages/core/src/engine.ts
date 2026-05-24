/**
 * The two-tier analysis orchestrator (C4, BC-03, §4.1).
 *
 *   Tier-1 (SYN / CFG / GRAPH) — ALWAYS runs. Parses each file with
 *     `ts.createSourceFile` and runs the activated rule visitors WITHOUT a
 *     checker. This is the broken-project fallback path, real-ish today.
 *
 *   Tier-2 (TYP) — GATED on `typecheck:ok`. Runs only when the project
 *     type-checks AND Tier-2 wasn't disabled (`deep !== false`). When skipped,
 *     every TYP rule records a `skippedCheckReason` and `scorePartial` is set —
 *     this is the partial-honesty contract (BC-03), and it is fully testable now
 *     even though the Tier-2 body currently emits nothing.
 *
 * Separation of concerns: the *decision* of which tiers run and what gets
 * skipped lives in {@link planEngineRun} (in `engine-plan.ts`), a PURE function
 * over rule metadata + capabilities with NO runtime sibling import — so BC-03 is
 * testable without the sibling package built. This module (`runEngine`) is the
 * impure shell that imports the registry + activation predicate from
 * `@ts-doctor/rules` and executes visitors.
 *
 * See REIMAGINED_ARCHITECTURE.md §4.1.
 */

import { resolve } from "node:path";
import ts from "typescript";
import {
  createGraphRuleContext,
  graphRuleRegistry,
  ruleRegistry,
  shouldActivate,
} from "@ts-doctor/rules";
import type { Capability, Diagnostic, Rule, RuleMeta } from "@ts-doctor/rules";
import { buildModuleGraph } from "./module-graph.js";
import {
  planEngineRun,
  type SeverityOverrides,
} from "./engine-plan.js";

export {
  planEngineRun,
  SKIP_REASON_NO_TYPECHECK,
  SKIP_REASON_NO_DEEP,
  type EnginePlan,
  type SeverityOverrides,
  type ActivatePredicate,
} from "./engine-plan.js";

/**
 * The per-file context a rule's `create()` receives. Derived structurally from
 * `Rule` so the engine depends only on contract-guaranteed exports (`ruleRegistry`,
 * `defineRule`, `shouldActivate`) and not on `RuleContext` by name.
 */
export type EngineRuleContext = Parameters<Rule["create"]>[0];
type EngineReportInput = Parameters<EngineRuleContext["report"]>[0];

/** The plugin name every ts-doctor diagnostic carries (first-party catalog — BC-18). */
export const PLUGIN_NAME = "ts-doctor" as const;

/**
 * Build the per-file rule context that auto-fills `plugin` + the meta-derived
 * fields, matching what `defineRule` bodies expect. Typed via
 * {@link EngineRuleContext} derived from `Rule`.
 */
function buildContext(
  meta: RuleMeta,
  args: {
    sourceFile: ts.SourceFile;
    filePath: string;
    checker?: ts.TypeChecker;
    sink: (d: Diagnostic) => void;
  },
): EngineRuleContext {
  const { sourceFile, filePath, checker, sink } = args;
  return {
    sourceFile,
    filePath,
    ...(checker !== undefined ? { checker } : {}),
    report(input: EngineReportInput): void {
      sink({
        plugin: PLUGIN_NAME,
        rule: meta.id,
        tier: meta.tier,
        category: meta.category,
        severity: meta.severity,
        ...input,
      });
    },
  } as EngineRuleContext;
}

/** A file to analyze: absolute path + its text contents. */
export interface SourceFileInput {
  filePath: string;
  text: string;
}

/** The full result of an engine run over a file set. */
export interface EngineResult {
  diagnostics: Diagnostic[];
  skippedChecks: string[];
  skippedCheckReasons: Record<string, string>;
  scorePartial: boolean;
}

/** Map a file extension to the right ts.ScriptKind so JSX parses correctly. */
function scriptKindFor(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

/** Walk a source file, invoking the visitor for every node. */
function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/**
 * Build ONE `ts.Program` over the in-memory file set (§4.1). A virtual compiler
 * host serves the provided files from memory and delegates everything else
 * (default lib, real imports) to the default host, so the checker can resolve
 * built-in types (`Promise`, unions, …). This is the single substrate whose
 * `getPreEmitDiagnostics` result *is* the `typecheck:ok` signal — there is no
 * separate probe build, and its parsed SourceFiles serve Tier-1 too.
 */
function buildProgramFromFiles(files: readonly SourceFileInput[]): ts.Program {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  };
  const host = ts.createCompilerHost(options, /* setParentNodes */ true);
  const fileMap = new Map<string, string>();
  for (const f of files) fileMap.set(resolve(f.filePath), f.text);

  const origGet = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, lvOrOpts, onError, shouldCreate) => {
    const text = fileMap.get(resolve(fileName));
    if (text !== undefined) {
      return ts.createSourceFile(fileName, text, lvOrOpts, true, scriptKindFor(fileName));
    }
    return origGet(fileName, lvOrOpts, onError, shouldCreate);
  };
  const origExists = host.fileExists.bind(host);
  host.fileExists = (fileName) => fileMap.has(resolve(fileName)) || origExists(fileName);
  const origRead = host.readFile.bind(host);
  host.readFile = (fileName) => {
    const text = fileMap.get(resolve(fileName));
    return text !== undefined ? text : origRead(fileName);
  };

  return ts.createProgram(
    files.map((f) => f.filePath),
    options,
    host,
  );
}

/**
 * Run the two-tier engine over a set of files (the impure shell, §4.1).
 *
 * Single Program build: when `deep !== false` and there are files, ONE
 * `ts.Program` is built; `getPreEmitDiagnostics()` filtered to errors *is* the
 * `typecheck:ok` signal (no separate probe — critic B1). That result is folded
 * into the capability set, so the pure {@link planEngineRun} sees the real
 * `typecheck:ok` and opens Tier-2 exactly when the project type-checks.
 *
 * Tier-1 (SYN/CFG/GRAPH): always runs, no checker. On the healthy path it reuses
 * the Program's already-parsed SourceFiles (one parse); only when no Program was
 * built (broken project / `--no-deep`) does it fall back to `ts.createSourceFile`.
 *
 * Tier-2 (TYP): runs only when `plan.tier2Enabled`, threading the single shared
 * `program.getTypeChecker()` into each TYP rule's context. When skipped, the plan
 * records skip reasons and `scorePartial` (BC-03).
 */
export function runEngine(
  files: readonly SourceFileInput[],
  caps: ReadonlySet<Capability>,
  ignoredTags: ReadonlySet<string>,
  overrides: SeverityOverrides,
  deep: boolean | undefined,
  rules: readonly Rule[] = ruleRegistry,
  configFilePath = "tsconfig.json",
): EngineResult {
  // --- Single Program build + typecheck:ok as a RESULT, not a pre-step (§4.1). ---
  let program: ts.Program | undefined;
  let typecheckOk = false;
  if (deep !== false && files.length > 0) {
    program = buildProgramFromFiles(files);
    const errors = ts.getPreEmitDiagnostics(program).filter(
      (d) => d.category === ts.DiagnosticCategory.Error,
    );
    typecheckOk = errors.length === 0;
  }

  // Reconcile the capability set with what the single build actually proved.
  const effectiveCaps = new Set<Capability>(caps);
  if (typecheckOk) effectiveCaps.add("typecheck:ok");
  else effectiveCaps.delete("typecheck:ok");

  // Pure planner (BC-03), fed the real activation predicate + reconciled caps.
  // `Rule extends RuleMeta`, so `rules` is directly a `readonly RuleMeta[]`.
  const plan = planEngineRun(
    rules,
    effectiveCaps,
    ignoredTags,
    overrides,
    deep,
    shouldActivate,
  );

  // Index activated rules by id so we can recover the `create` body.
  const ruleById = new Map<string, Rule>();
  for (const r of rules) ruleById.set(r.id, r);

  const diagnostics: Diagnostic[] = [];
  const sink = (d: Diagnostic): void => {
    diagnostics.push(d);
  };

  // --- CFG rules are PROJECT-LEVEL: they don't walk a file AST. Each activated
  // CFG rule emits exactly one diagnostic at the config file (line 1), carrying
  // its `message` (the inverted-gating "enable this flag" finding, §C9/BC-09).
  const perFileTier1 = plan.tier1.filter((e) => e.meta.tier !== "CFG");
  for (const { meta, severity } of plan.tier1) {
    if (meta.tier !== "CFG") continue;
    sink({
      plugin: PLUGIN_NAME,
      rule: meta.id,
      tier: "CFG",
      category: meta.category,
      severity,
      filePath: configFilePath,
      message: meta.message ?? meta.recommendation ?? `Enable ${meta.id}.`,
      help: meta.recommendation ?? "",
      line: 1,
      column: 1,
    });
  }

  // Reuse the Program's parsed SourceFile when present; else parse standalone.
  const sourceFileFor = (filePath: string, text: string): ts.SourceFile => {
    if (program !== undefined) {
      const fromProgram = program.getSourceFile(filePath);
      if (fromProgram !== undefined) return fromProgram;
    }
    return ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      scriptKindFor(filePath),
    );
  };

  // The single shared checker, available only when Tier-2 is open.
  const checker =
    program !== undefined && plan.tier2Enabled
      ? program.getTypeChecker()
      : undefined;

  const runVisitors = (
    rule: Rule,
    sourceFile: ts.SourceFile,
    filePath: string,
    withChecker: boolean,
  ): void => {
    const ctx = buildContext(rule, {
      sourceFile,
      filePath,
      ...(withChecker && checker !== undefined ? { checker } : {}),
      sink,
    });
    const visitors = rule.create(ctx);
    walk(sourceFile, (n) => {
      const handler = visitors[n.kind];
      if (handler !== undefined) handler(n, ctx);
    });
  };

  for (const { filePath, text } of files) {
    const sourceFile = sourceFileFor(filePath, text);

    // Tier-1 (per-file): SYN, no checker. CFG is project-level (above); GRAPH
    // runs in the graph pass (below).
    for (const { meta } of perFileTier1) {
      const rule = ruleById.get(meta.id);
      if (rule !== undefined) runVisitors(rule, sourceFile, filePath, false);
    }

    // Tier-2: TYP, with the single shared checker (§4.1).
    if (checker !== undefined) {
      for (const { meta } of plan.tier2) {
        const rule = ruleById.get(meta.id);
        if (rule !== undefined) runVisitors(rule, sourceFile, filePath, true);
      }
    }
  }

  // --- GRAPH tier: whole-module-graph rules, run ONCE over the file set. They
  // are structural (no checker), so they run regardless of `typecheck:ok`. ---
  if (files.length > 0 && graphRuleRegistry.length > 0) {
    const activeGraphRules = graphRuleRegistry.filter((g) =>
      shouldActivate(g, effectiveCaps, ignoredTags, overrides.get(g.id)),
    );
    if (activeGraphRules.length > 0) {
      const graph = buildModuleGraph(files);
      for (const g of activeGraphRules) {
        g.analyze(createGraphRuleContext(g, { graph, sink }));
      }
    }
  }

  return {
    diagnostics,
    skippedChecks: plan.skippedChecks,
    skippedCheckReasons: plan.skippedCheckReasons,
    scorePartial: plan.scorePartial,
  };
}

/**
 * FROZEN VENDORED ORACLE — a byte-faithful copy of legacy `runEngine`
 * (`legacy/tsnuke/packages/core/src/engine.ts:64-326`, READ-ONLY) as a plain
 * SYNCHRONOUS function, used ONLY by `equivalence.test.ts` to prove the modern Effect
 * `runEngine` produces the IDENTICAL `EngineResult`.
 *
 * WHAT IS FROZEN HERE: the legacy execution SHELL — `buildContext`, `buildProgramFromFiles`
 * (the exact CompilerOptions + virtual host), the single-Program build, the
 * `typecheck:ok`-as-result reconciliation, the CFG project-level emit, the parse-once
 * Tier-1/Tier-2 loop, and the GRAPH pass. This is copied verbatim from legacy with TWO
 * mechanical adaptations that DO NOT change behavior:
 *   1. The legacy `import { ... } from "@tsnuke/rules"` (the legacy package) is replaced
 *      by INJECTED deps — the SAME already-proven MODERN components the real engine uses
 *      (`ruleRegistry`/`graphRuleRegistry`/`shouldActivate`/`buildModuleGraph`/
 *      `createGraphRuleContext`/`planEngineRun`). Feeding both sides the identical proven
 *      components isolates what this proof targets: the execution-shell WIRING.
 *   2. It is a plain `function` (legacy was sync); the modern engine wraps the same logic in
 *      an `Effect` solely for the Program lifecycle (RULE-036). With the memory guard inert
 *      (default), the two must be byte-identical — that is the equivalence claim.
 *
 * The legacy engine NEVER disposed the Program (the RULE-036 defect); this oracle likewise
 * does not — its purpose is to reproduce legacy OUTPUT, not legacy lifecycle.
 */

import { resolve } from "node:path";
import ts from "typescript";
import { shouldActivate } from "@tsnuke/capabilities-effect";
import type { Capability, Diagnostic, RuleMeta } from "@tsnuke/contracts-effect";
import { buildModuleGraph } from "@tsnuke/module-graph-effect";
import { planEngineRun, type SeverityOverrides } from "@tsnuke/engine-plan-effect";
import {
  createGraphRuleContext,
  createRuleContext,
  type GraphRule,
  type Rule,
} from "@tsnuke/rules-core-effect";
import { graphRuleRegistry, ruleRegistry } from "@tsnuke/rules-registry-effect";
import type { EngineResult, SourceFileInput } from "../main/runEngine.js";

const PLUGIN_NAME = "tsnuke" as const;

/** Legacy `scriptKindFor` (engine.ts:106-113), verbatim. */
function scriptKindFor(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

/** Legacy `walk` (engine.ts:116-119), verbatim. */
function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/** Legacy `buildProgramFromFiles` (engine.ts:129-163), verbatim. */
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
 * Legacy `runEngine` (engine.ts:182-326), frozen — SAME positional signature, with the
 * `rules`/`configFilePath` defaults and the modern injected deps. NO memory guard (legacy
 * had none); NO Program disposal (legacy never did). Plain synchronous.
 */
export function legacyRunEngine(
  files: readonly SourceFileInput[],
  caps: ReadonlySet<Capability>,
  ignoredTags: ReadonlySet<string>,
  overrides: SeverityOverrides,
  deep: boolean | undefined,
  rules: readonly Rule[] = ruleRegistry,
  graphRules: readonly GraphRule[] = graphRuleRegistry,
  configFilePath = "tsconfig.json",
): EngineResult {
  let program: ts.Program | undefined;
  let typecheckOk = false;
  if (deep !== false && files.length > 0) {
    program = buildProgramFromFiles(files);
    const errors = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.category === ts.DiagnosticCategory.Error);
    typecheckOk = errors.length === 0;
  }

  const effectiveCaps = new Set<Capability>(caps);
  if (typecheckOk) effectiveCaps.add("typecheck:ok");
  else effectiveCaps.delete("typecheck:ok");

  const plan = planEngineRun(
    rules as readonly RuleMeta[],
    effectiveCaps,
    ignoredTags,
    overrides,
    deep,
    shouldActivate,
  );

  const ruleById = new Map<string, Rule>();
  for (const r of rules) ruleById.set(r.id, r);

  const diagnostics: Diagnostic[] = [];
  const sink = (d: Diagnostic): void => {
    diagnostics.push(d);
  };

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

  const checker =
    program !== undefined && plan.tier2Enabled ? program.getTypeChecker() : undefined;

  const runVisitors = (
    rule: Rule,
    sourceFile: ts.SourceFile,
    filePath: string,
    withChecker: boolean,
  ): void => {
    const ctx = createRuleContext(rule, {
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

    for (const { meta } of perFileTier1) {
      const rule = ruleById.get(meta.id);
      if (rule !== undefined) runVisitors(rule, sourceFile, filePath, false);
    }

    if (checker !== undefined) {
      for (const { meta } of plan.tier2) {
        const rule = ruleById.get(meta.id);
        if (rule !== undefined) runVisitors(rule, sourceFile, filePath, true);
      }
    }
  }

  if (files.length > 0 && graphRules.length > 0) {
    const activeGraphRules = graphRules.filter((g) =>
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
    skippedChecks: [...plan.skippedChecks],
    skippedCheckReasons: { ...plan.skippedCheckReasons },
    scorePartial: plan.scorePartial,
  };
}

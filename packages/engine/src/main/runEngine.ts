/**
 * The two-tier analysis orchestrator — the impure execution SHELL (RULE-018, P0;
 * RULE-036; RULE-013). Faithful Effect port of legacy
 * `legacy/ts-doctor/packages/core/src/engine.ts:64-326` (READ-ONLY): `buildContext`,
 * `buildProgramFromFiles`, and `runEngine`.
 *
 *   Tier-1 (SYN / CFG / GRAPH) — ALWAYS runs. Parses each file (reusing the Program's
 *     already-parsed SourceFile when present) and runs the activated rule visitors
 *     WITHOUT a checker. The broken-project fallback path.
 *
 *   Tier-2 (TYP) — GATED on `typecheck:ok` AND `deep !== false` AND (now) the
 *     RULE-013 memory guard. When skipped, every would-be TYP rule is recorded in
 *     `skippedChecks`/`skippedCheckReasons` and `scorePartial` is set — the
 *     partial-honesty contract (RULE-018). This is the single most behavior-defining
 *     rule in the system; it is preserved EXACTLY.
 *
 * WHAT THE EFFECT PORT CHANGES vs legacy (see TRANSFORMATION_NOTES.md §2):
 *   - **RULE-036 (Program disposal), WIRED.** Legacy built ONE `ts.Program` and never
 *     disposed it — the confirmed monorepo-OOM defect. Here the Program is acquired
 *     via `scale.scopedProgram` (`Effect.acquireRelease`), so its reference is dropped
 *     when the surrounding `Scope` closes — on success, failure, AND interruption.
 *     `runEngine` therefore returns an `Effect<EngineResult, never, Scope>`.
 *   - **RULE-013 (memory ceiling), WIRED but INERT by default.** Legacy's guard was
 *     unwired dead code. Here it is wired via `scale.shouldSkipTier2ForMemory`, fed an
 *     INJECTED `currentRssBytes` (default `0`, which never skips) so behavior is
 *     byte-identical to legacy on the test corpus. Inject an over-ceiling RSS to drive
 *     the skip path. When it fires, Tier-2 is treated exactly like `tier2Enabled=false`
 *     (NO_TYPECHECK-style accounting via the planner) and `scorePartial` is set.
 *   - **rules-core's `createRuleContext`/`createGraphRuleContext` are REUSED** as the
 *     context substrate (legacy inlined an equivalent `buildContext`); reusing keeps
 *     the engine's contexts byte-identical to what the proven rule slices expect.
 *
 * The rule EXECUTION (parse → walk → dispatch by SyntaxKind) stays PLAIN SYNCHRONOUS —
 * a fiber buys nothing for an in-memory `forEachChild` walk. Only the Program lifecycle
 * is genuinely effectful. The engine's parse-once-run-many loop is its OWN (it does NOT
 * use rules-core's `runRule`, which re-parses per snippet).
 */

import { resolve } from "node:path";
import { Effect, type Scope } from "effect";
import ts from "typescript";
import { shouldActivate } from "@ts-doctor/capabilities-effect";
import type { Capability } from "@ts-doctor/contracts-effect";
import { buildModuleGraph } from "@ts-doctor/module-graph-effect";
import {
  planEngineRun,
  SKIP_REASON_NO_DEEP,
  type SeverityOverrides,
} from "@ts-doctor/engine-plan-effect";
import {
  createGraphRuleContext,
  createRuleContext,
  type GraphRule,
  type Rule,
} from "@ts-doctor/rules-core-effect";
import { graphRuleRegistry, ruleRegistry } from "@ts-doctor/rules-registry-effect";
import {
  DEFAULT_TIER2_MEMORY_CEILING_BYTES,
  scopedProgram,
  shouldSkipTier2ForMemory,
} from "@ts-doctor/scale-effect";
import type { Diagnostic } from "@ts-doctor/contracts-effect";

export {
  planEngineRun,
  SKIP_REASON_NO_TYPECHECK,
  SKIP_REASON_NO_DEEP,
  type EnginePlan,
  type SeverityOverrides,
  type ActivatePredicate,
} from "@ts-doctor/engine-plan-effect";

/** The plugin name every ts-doctor diagnostic carries (first-party catalog — BC-18). */
export const PLUGIN_NAME = "ts-doctor" as const;

/** A file to analyze: absolute path + its text contents. */
export interface SourceFileInput {
  readonly filePath: string;
  readonly text: string;
}

/** The full result of an engine run over a file set. */
export interface EngineResult {
  readonly diagnostics: Diagnostic[];
  readonly skippedChecks: string[];
  readonly skippedCheckReasons: Record<string, string>;
  readonly scorePartial: boolean;
}

/**
 * The RULE-013 memory guard inputs, INJECTED for determinism (the engine does NOT read
 * `process.memoryUsage()` itself — the prod edge supplies the live RSS). DEFAULTS make
 * the guard INERT (`currentRssBytes: 0`, `estimatedProgramBytes: 0`) so a default run is
 * byte-identical to legacy. Inject an over-ceiling `currentRssBytes` to exercise the skip.
 */
export interface MemoryGuard {
  /** Resident set size right now, in bytes. Default `0` (never skips). */
  readonly currentRssBytes?: number;
  /** Estimated additional cost of building the next `ts.Program`. Default `0`. */
  readonly estimatedProgramBytes?: number;
  /** Override the host ceiling; defaults to scale's `DEFAULT_TIER2_MEMORY_CEILING_BYTES`. */
  readonly ceilingBytes?: number;
}

/** Options for {@link runEngine} beyond the positional legacy parameters. */
export interface RunEngineOptions {
  /** Candidate rules (default: the global `ruleRegistry`). */
  readonly rules?: readonly Rule[];
  /** GRAPH-tier rules (default: the global `graphRuleRegistry`). Injectable for the oracle. */
  readonly graphRules?: readonly GraphRule[];
  /** The tsconfig path CFG project-level findings are pinned to (default `tsconfig.json`). */
  readonly configFilePath?: string;
  /** RULE-013 memory guard — injected RSS/ceiling. Default inert (never skips). */
  readonly memory?: MemoryGuard;
  /**
   * Test/observability seam: invoked when the scoped `ts.Program`'s finalizer runs (the
   * RULE-036 release). Lets a caller PROVE the OOM-cure disposal fires for the engine's own
   * Program, rather than borrowing the scale slice's proof. Not called when no Program is built.
   */
  readonly onProgramRelease?: () => void;
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

/** The EXACT legacy CompilerOptions — preserved verbatim (engine.ts:130-137). */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
};

/**
 * Build ONE `ts.Program` over the in-memory file set (§4.1). A virtual compiler host
 * serves the provided files from memory and delegates everything else (default lib,
 * real imports) to the default host, so the checker can resolve built-in types
 * (`Promise`, unions, …). Faithful port of legacy `buildProgramFromFiles`
 * (engine.ts:129-163). PURE/synchronous TS-API work — wrapped in `Effect.sync` only by
 * the caller (the `acquire` side of `scopedProgram`).
 */
function buildProgramFromFiles(files: readonly SourceFileInput[]): ts.Program {
  const host = ts.createCompilerHost(COMPILER_OPTIONS, /* setParentNodes */ true);
  const fileMap = new Map<string, string>(files.map((f) => [resolve(f.filePath), f.text]));

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
    COMPILER_OPTIONS,
    host,
  );
}

/**
 * Run the two-tier engine over a set of files (the impure shell, §4.1) — as an `Effect`
 * whose ONLY effectful concern is the `ts.Program` lifecycle (RULE-036). The Program is
 * acquired into the ambient {@link Scope.Scope} via `scale.scopedProgram` and RELEASED
 * when that Scope closes (legacy NEVER disposed it — the confirmed OOM defect). Compose
 * with `Effect.scoped` (or `diagnose`, which carries `Scope` in its requirements) to
 * bound the lifetime.
 *
 * Mirrors legacy `runEngine` (engine.ts:182-326) exactly except for the WIRED RULE-036
 * disposal + RULE-013 memory guard (inert by default). The positional parameters match
 * legacy 1:1; the optional 7th legacy arg (`rules`) and 8th (`configFilePath`) plus the
 * new memory/graph seams live in {@link RunEngineOptions}.
 *
 * @param files        the in-memory file set to analyze
 * @param caps         the project's capability token set (`typecheck:ok` reconciled here)
 * @param ignoredTags  tags the config asked to ignore
 * @param overrides    per-rule severity overrides from config (id → sev | "off")
 * @param deep         tri-state Tier-2 control: true forces, false skips, undefined = auto
 * @param options      rules / graphRules / configFilePath / RULE-013 memory guard
 * @returns `Effect<EngineResult, never, Scope.Scope>`
 */
export const runEngine: (
  files: readonly SourceFileInput[],
  caps: ReadonlySet<Capability>,
  ignoredTags: ReadonlySet<string>,
  overrides: SeverityOverrides,
  deep: boolean | undefined,
  options?: RunEngineOptions,
) => Effect.Effect<EngineResult, never, Scope.Scope> = Effect.fn("Engine.run")(
  function* (
    files: readonly SourceFileInput[],
    caps: ReadonlySet<Capability>,
    ignoredTags: ReadonlySet<string>,
    overrides: SeverityOverrides,
    deep: boolean | undefined,
    options: RunEngineOptions = {},
  ) {
    const rules = options.rules ?? ruleRegistry;
    const graphRules = options.graphRules ?? graphRuleRegistry;
    const configFilePath = options.configFilePath ?? "tsconfig.json";
    const mem = options.memory ?? {};
    const currentRssBytes = mem.currentRssBytes ?? 0;
    const estimatedProgramBytes = mem.estimatedProgramBytes ?? 0;
    const ceilingBytes = mem.ceilingBytes ?? DEFAULT_TIER2_MEMORY_CEILING_BYTES;
    const onProgramRelease = options.onProgramRelease;

    // --- Single Program build + typecheck:ok as a RESULT, not a pre-step (§4.1). ---
    // RULE-036: the Program is acquired into the Scope and released when it closes — the
    // OOM cure legacy never ran. The build/release are the one genuinely-effectful part.
    const buildProgram = deep !== false && files.length > 0;
    const program: ts.Program | undefined = buildProgram
      ? yield* scopedProgram(
          Effect.sync(() => buildProgramFromFiles(files)),
          // Release: drop the reference so the Program (and its parsed SourceFiles +
          // checker state) becomes eligible for GC before the next project's build —
          // never holding N Programs resident (the monorepo memory fix, RULE-036). The
          // `onProgramRelease` seam lets callers/tests OBSERVE that this finalizer fires.
          () => {
            onProgramRelease?.();
          },
        )
      : undefined;

    const typecheckOk =
      program !== undefined &&
      ts
        .getPreEmitDiagnostics(program)
        .filter((d) => d.category === ts.DiagnosticCategory.Error).length === 0;

    // --- RULE-013 (WIRED, inert by default): under memory pressure, skip Tier-2. ---
    // We model "skip for memory" as forcing the planner's `deep` to false ONLY for the
    // gating decision when the project would otherwise have opened Tier-2 — so the
    // already-proven `planEngineRun` produces the identical skip accounting + scorePartial
    // it produces for `--no-deep`. The default (RSS 0) never trips this, keeping behavior
    // byte-identical to legacy (the equivalence proof runs with the guard inert).
    const memoryPressure =
      typecheckOk &&
      deep !== false &&
      shouldSkipTier2ForMemory(currentRssBytes, estimatedProgramBytes, ceilingBytes);

    // Reconcile the capability set with what the single build actually proved.
    const effectiveCaps = new Set<Capability>(caps);
    if (typecheckOk) effectiveCaps.add("typecheck:ok");
    if (!typecheckOk) effectiveCaps.delete("typecheck:ok");

    // The `deep` the planner sees: the caller's `deep`, but forced false under memory
    // pressure so Tier-2 is gated CLOSED and every would-be TYP rule is recorded skipped.
    const effectiveDeep = memoryPressure ? false : deep;

    // Pure planner (RULE-018), fed the real activation predicate + reconciled caps.
    // `Rule extends RuleMeta`, so `rules` is directly a `readonly RuleMeta[]`.
    const plan = planEngineRun(
      rules,
      effectiveCaps,
      ignoredTags,
      overrides,
      effectiveDeep,
      shouldActivate,
    );

    // Under memory pressure the project type-checked but we forced the planner's `deep`
    // false, so every skip it recorded carries the NO_DEEP reason. The TRUE cause is memory,
    // so rewrite ONLY those NO_DEEP reasons to the memory-specific message — defensive: never
    // relabel a skip the planner attributed to anything else (keeps the relabel honest if the
    // planner ever skips a TYP rule for a different reason while memory pressure also holds).
    // The skip SET and `scorePartial` stay exactly the planner's.
    const skippedCheckReasons: Record<string, string> = { ...plan.skippedCheckReasons };
    if (memoryPressure) {
      for (const id of plan.skippedChecks) {
        if (skippedCheckReasons[id] === SKIP_REASON_NO_DEEP) {
          skippedCheckReasons[id] = SKIP_REASON_MEMORY;
        }
      }
    }

    // Index activated rules by id so we can recover the `create` body.
    const ruleById = new Map<string, Rule>(rules.map((r) => [r.id, r]));

    const diagnostics: Diagnostic[] = [];
    const sink = (d: Diagnostic): void => {
      diagnostics.push(d);
    };

    // --- CFG rules are PROJECT-LEVEL: they don't walk a file AST. Each activated CFG
    // rule emits exactly one diagnostic at the config file (line 1), carrying its
    // `message` (the inverted-gating "enable this flag" finding, §C9/BC-09). ---
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

      // Tier-1 (per-file): SYN, no checker. CFG is project-level (above); GRAPH runs in
      // the graph pass (below).
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

    // --- GRAPH tier: whole-module-graph rules, run ONCE over the file set. They are
    // structural (no checker), so they run regardless of `typecheck:ok`. ---
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
      skippedCheckReasons,
      scorePartial: plan.scorePartial,
    } satisfies EngineResult;
  },
);

/**
 * Why a TYP check was skipped under RULE-013 memory pressure (WIRED here — legacy never
 * had this path since its guard was dead code). Distinct from the planner's
 * NO_TYPECHECK / NO_DEEP reasons: those mean "the project doesn't type-check" / "the user
 * passed --no-deep"; this means "the project type-checks and deep was requested, but RSS
 * + estimate would breach the ceiling, so Tier-2 was shed to avoid OOM".
 */
export const SKIP_REASON_MEMORY =
  "Tier-2 (type-aware) skipped: memory ceiling would be exceeded (RULE-013 graceful degradation).";

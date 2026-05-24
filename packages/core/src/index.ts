/**
 * Public surface of `@ts-doctor/core` — the boundary `@ts-doctor/api` will later
 * re-export verbatim (critic m5). Keep this clean: it IS the programmatic API.
 *
 * `diagnose(dir, opts)` wires the pipeline end-to-end:
 *   discover → capabilities → load config → engine (Tier-1 real, Tier-2 stubbed)
 *   → filter pipeline → local score → DiagnoseResult.
 *
 * See AI_NATIVE_SPEC.md §3.2 / REIMAGINED_ARCHITECTURE.md §3.2.
 */

import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { Diagnostic, Severity } from "@ts-doctor/rules";

import { computeScore } from "./score.js";
import {
  discoverTsProject,
  computeCapabilities,
  collectSourceFiles,
} from "./discover-ts-project.js";
import { runEngine, type SourceFileInput } from "./engine.js";
import {
  runFilterPipeline,
  type DiagnosticWithTags,
} from "./filter-pipeline.js";
import { loadConfig } from "./load-config.js";
import type {
  DiagnoseOptions,
  DiagnoseResult,
  ProjectInfo,
  ScoreResult,
} from "./types.js";

// ---- Types (orchestration types this package OWNS) ----
export type {
  ProjectInfo,
  ScoreResult,
  JsonReportSummary,
  JsonReportV1,
  JsonReportProjectEntry,
  JsonReportError,
  DiagnoseOptions,
  DiagnoseResult,
  TsDoctorConfig,
} from "./types.js";

// ---- Errors ----
export {
  TsDoctorError,
  ProjectNotFoundError,
  NoTypeScriptProjectError,
  TsconfigNotFoundError,
  AmbiguousProjectError,
  isTsDoctorError,
} from "./errors.js";

// ---- Scoring ----
export {
  computeScore,
  scoreLabel,
  summarizeMonorepoScore,
  ERROR_RULE_PENALTY,
  WARNING_RULE_PENALTY,
  PERFECT_SCORE,
  SCORE_GOOD,
  SCORE_OK,
} from "./score.js";

// ---- Discovery + capabilities ----
export {
  discoverTsProject,
  computeCapabilities,
  collectSourceFiles,
} from "./discover-ts-project.js";

// ---- Engine ----
export {
  planEngineRun,
  runEngine,
  PLUGIN_NAME,
  SKIP_REASON_NO_TYPECHECK,
  SKIP_REASON_NO_DEEP,
  type EnginePlan,
  type EngineResult,
  type EngineRuleContext,
  type SeverityOverrides,
  type ActivatePredicate,
  type SourceFileInput,
} from "./engine.js";

// ---- Agent-tuned output (C14) + offline explain (shared by CLI + MCP) ----
export { formatAgentReport } from "./format-agent.js";
export type {
  AgentReport,
  AgentRuleEntry,
  AgentOccurrence,
  AgentCategoryGroup,
} from "./format-agent.js";
export { explain, explainDiagnostic, asRuleLookup } from "./explain.js";
export type { RuleLookup, ExplainContext } from "./explain.js";

// ---- Filter pipeline ----
export {
  runFilterPipeline,
  type DiagnosticWithTags,
  type FilterPipelineOptions,
  type SourceTextMap,
} from "./filter-pipeline.js";

// ---- Config ----
export {
  loadConfig,
  loadConfigWithWarnings,
  sanitizeConfig,
  type LoadConfigResult,
} from "./load-config.js";

// ---- Report ----
export {
  buildReport,
  serializeError,
  JSON_REPORT_SCHEMA_VERSION,
  type BuildReportInput,
  type BuildReportProject,
} from "./build-report.js";

// ---- Scale guard ----
export {
  withDisposable,
  withDisposableProgram,
  shouldSkipTier2ForMemory,
  DEFAULT_TIER2_MEMORY_CEILING_BYTES,
  type DisposableResource,
} from "./scale.js";

// ---- Security services ----
export {
  isSafeGitRevision,
  isInsideTempDir,
  validateGlobPattern,
  InvalidGlobPatternError,
  MAX_GLOB_PATTERN_LENGTH,
  MAX_GLOB_PATTERN_WILDCARDS,
  sanitizeEnv,
  loadConfigPlugins,
  type LoadConfigPluginsResult,
  type LoadedPlugin,
} from "./security/index.js";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

/** Read the files to analyze (full project or a narrowed include set). */
function readSourceFiles(includePaths: readonly string[]): SourceFileInput[] {
  const out: SourceFileInput[] = [];
  for (const filePath of includePaths) {
    if (!SOURCE_EXTENSIONS.has(extname(filePath))) continue;
    try {
      out.push({ filePath, text: readFileSync(filePath, "utf8") });
    } catch {
      // A file we can't read is simply skipped — never fatal.
    }
  }
  return out;
}

/** Build the per-rule severity-override map from config (id → sev | "off"). */
function overridesFromConfig(
  rules: Record<string, "error" | "warn" | "off"> | undefined,
): Map<string, Severity | "off"> {
  const out = new Map<string, Severity | "off">();
  for (const [id, value] of Object.entries(rules ?? {})) {
    out.set(id, value === "warn" ? "warning" : value);
  }
  return out;
}

/**
 * Diagnose a single TypeScript project (the public boundary, AI_NATIVE_SPEC §3.2).
 *
 * Wires: discover → capabilities → config → engine (Tier-1 real; Tier-2 gated on
 * `typecheck:ok` and currently stubbed) → filter pipeline → local score.
 * `scorePartial` is true whenever Tier-2 was skipped (BC-03). Async to match the
 * stable public signature even though v1 work is synchronous.
 *
 * NOTE: `elapsedMilliseconds` is the one intentional non-deterministic field
 * (timing telemetry) — it never feeds the score, which stays deterministic.
 */
export async function diagnose(
  directory: string,
  options: DiagnoseOptions = {},
): Promise<DiagnoseResult> {
  const startedAt = Date.now();

  const project: ProjectInfo = discoverTsProject(directory);
  const caps = computeCapabilities(project);
  const config = loadConfig(directory);

  const ignoredTags = new Set(config.ignore?.tags ?? []);
  const overrides = overridesFromConfig(config.rules);

  // Diff/staged modes pass an explicit include set; a full scan enumerates the
  // project's source tree.
  const includePaths = options.includePaths ?? collectSourceFiles(project.rootDirectory);
  const files = readSourceFiles(includePaths);

  const engineResult = runEngine(
    files,
    caps,
    ignoredTags,
    overrides,
    options.deep,
    undefined, // rules → default registry
    join(project.rootDirectory, "tsconfig.json"),
  );

  // Filter pipeline (BC-11). Carry source text for the inline-disable stage.
  const sources = new Map<string, string>(
    files.map((f) => [f.filePath, f.text]),
  );
  const filtered: Diagnostic[] = runFilterPipeline(
    engineResult.diagnostics as DiagnosticWithTags[],
    config,
    {
      respectInlineDisables: options.respectInlineDisables !== false,
      sources,
    },
  );

  // Local, deterministic score (BC-01..04). Carry partial honesty (BC-03).
  const { score, label } = computeScore(filtered);
  const scoreResult: ScoreResult = {
    score,
    label,
    partial: engineResult.scorePartial,
  };

  const result: DiagnoseResult = {
    diagnostics: filtered,
    score: scoreResult,
    scorePartial: engineResult.scorePartial,
    skippedChecks: engineResult.skippedChecks,
    project,
    elapsedMilliseconds: Date.now() - startedAt,
  };
  if (Object.keys(engineResult.skippedCheckReasons).length > 0) {
    result.skippedCheckReasons = engineResult.skippedCheckReasons;
  }
  return result;
}

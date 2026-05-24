/**
 * Orchestration types OWNED by `@ts-doctor/core`.
 *
 * These model what core produces between "a directory" and "a report":
 * project discovery facts, the local score result, the versioned JSON report,
 * the `diagnose()` options/result contract, and the user config shape.
 *
 * The *producer-side* domain types (`Diagnostic`, `Fix`, `Severity`, `Tier`,
 * `RuleMeta`, `Capability`, …) live in `@ts-doctor/rules` and are imported here
 * as types only (erased at runtime — see verbatimModuleSyntax).
 *
 * See AI_NATIVE_SPEC.md §2/§3 and REIMAGINED_ARCHITECTURE.md §3.2.
 */

import type { Diagnostic } from "@ts-doctor/rules";

/**
 * Discovered facts about a TypeScript project (C1). These *produce* the
 * capability token set (§4.1). `discoverTsProject` fills this; `computeCapabilities`
 * consumes it.
 */
export interface ProjectInfo {
  /** Absolute path of the project root that was discovered. */
  rootDirectory: string;
  /** `package.json#name` if present, else the directory basename. */
  projectName: string;
  /** Raw `typescript` version string (e.g. `"5.8.2"`), or null if unresolved. */
  tsVersion: string | null;
  /** Major version parsed from `tsVersion`, or null. */
  tsMajor: number | null;
  projectKind: "app" | "lib" | "monorepo" | "unknown";
  moduleSystem: "esm" | "cjs";
  buildTool:
    | "tsc"
    | "tsup"
    | "vite"
    | "swc"
    | "esbuild"
    | "bun"
    | "babel"
    | "unknown";
  /** Map of tsconfig strict-family flags that are ON (e.g. `{ strict: true }`). */
  strictFlags: Record<string, boolean>;
  /**
   * Whether `ts.Program` builds and `getPreEmitDiagnostics()` is clean (BC-07).
   * In the scaffold this is a derived/provided stub (see discover-ts-project.ts).
   */
  typecheckOk: boolean;
  /** Count of `.ts`/`.tsx` source files discovered. */
  sourceFileCount: number;
}

/** The result of local scoring (§5, BC-01/04). */
export interface ScoreResult {
  /** 0–100 integer. */
  score: number;
  /** Band label: "Great" / "Needs work" / "Critical". */
  label: string;
  /** True when Tier-2 was skipped — score is on a different scale (BC-03). */
  partial: boolean;
}

/** Aggregate counts + score carried in a report's `summary` (BC-23). */
export interface JsonReportSummary {
  errorCount: number;
  warningCount: number;
  affectedFileCount: number;
  totalDiagnosticCount: number;
  score: number | null;
  scoreLabel: string | null;
  scorePartial: boolean;
}

/** Per-project entry in a (possibly monorepo) report. */
export interface JsonReportProjectEntry {
  directory: string;
  /** Discovered project facts (ProjectInfo); `unknown` to keep the report schema decoupled. */
  project?: unknown;
  diagnostics: Diagnostic[];
  score: number | null;
  scorePartial: boolean;
  skippedChecks: string[];
  /** Optional per-check skip reasons (rule/check id → reason). */
  skippedCheckReasons?: Record<string, string>;
  elapsedMilliseconds: number;
}

/** A serialized error, carried when a run fails (`ok:false`). */
export interface JsonReportError {
  message: string;
  name: string;
  /** The `.cause` chain flattened to messages, root-last. */
  chain: string[];
}

/** Diff/staged-mode metadata (present only when `mode !== "full"`). */
export interface JsonReportDiffInfo {
  baseBranch: string;
  currentBranch: string | null;
  changedFileCount: number;
  isCurrentChanges: boolean;
}

/**
 * The versioned JSON report (BC-23). A single-arm union keyed on
 * `schemaVersion` for forward-compat; v1 is the only arm today.
 */
export interface JsonReportV1 {
  schemaVersion: 1;
  version: string;
  ok: boolean;
  directory: string;
  mode: "full" | "diff" | "staged";
  diff: JsonReportDiffInfo | null;
  diagnostics: Diagnostic[];
  summary: JsonReportSummary;
  projects: JsonReportProjectEntry[];
  elapsedMilliseconds: number;
  error: JsonReportError | null;
}

/** Options for the top-level `diagnose()` entry point (AI_NATIVE_SPEC §3.2). */
export interface DiagnoseOptions {
  lint?: boolean;
  deadCode?: boolean;
  /** Force/skip Tier-2; default auto (runs iff `typecheck:ok`). */
  deep?: boolean;
  verbose?: boolean;
  /** Diff/staged narrowing: report only on these paths. */
  includePaths?: string[];
  respectInlineDisables?: boolean;
}

/** The result of a single-project `diagnose()` call (the public boundary). */
export interface DiagnoseResult {
  diagnostics: Diagnostic[];
  score: ScoreResult | null;
  /** True when Tier-2 was skipped (mirrors `score.partial`). */
  scorePartial: boolean;
  skippedChecks: string[];
  /** Per-skipped-check human reason, e.g. why TYP rules were skipped (BC-03). */
  skippedCheckReasons?: Record<string, string>;
  project: ProjectInfo;
  elapsedMilliseconds: number;
}

/**
 * User config (`tsdoctor.config.json` / `package.json#tsDoctor`).
 * Loaded leniently — invalid fields are dropped, never fatal (BC-22).
 */
export interface TsDoctorConfig {
  ignore?: {
    rules?: string[];
    files?: string[];
    tags?: string[];
    overrides?: { files: string[]; rules?: string[] }[];
  };
  failOn?: "error" | "warning" | "none";
  customRulesOnly?: boolean;
  /** v1: IGNORED and never loaded (BC-18). Present only so it can be warned about. */
  plugins?: string[];
  rules?: Record<string, "error" | "warn" | "off">;
  categories?: Record<string, "error" | "warn" | "off">;
}

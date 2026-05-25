/**
 * Shared test fixtures: a stub {@link InspectIo} that captures stdout/stderr and serves a
 * canned `DiagnoseResult`, plus sample diagnostics. Lets the behavioral tests exercise
 * the `runInspect` flow with NO real process / disk (the brief's injectable IO seam).
 */

import { Effect } from "effect";
import type { Diagnostic, RuleMeta } from "@tsnuke/contracts-effect";
import type { DiagnoseResult, ProjectInfo } from "@tsnuke/engine-effect";
import type { ApplyFilesResult } from "@tsnuke/fix-applier-effect";
import type { InspectIo } from "../main/inspectHandler.js";

/** Build a sample diagnostic with overridable fields. */
export const diag = (over: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: "/proj/src/a.ts",
  plugin: "tsnuke",
  rule: "no-any",
  severity: "warning",
  message: "Avoid `any`.",
  help: "Use a precise type.",
  line: 3,
  column: 5,
  category: "type-safety",
  tier: "SYN",
  ...over,
});

/** A minimal `ProjectInfo` (only `rootDirectory` is read by the handler). */
export const project: ProjectInfo = {
  rootDirectory: "/proj",
  projectName: "proj",
  tsVersion: "5.8.0",
  tsMajor: 5,
  projectKind: "single",
  moduleSystem: "esm",
  buildTool: "none",
  strictFlags: { strict: true },
  typecheckOk: true,
  sourceFileCount: 1,
} as unknown as ProjectInfo;

/** Build a canned `DiagnoseResult`. */
export const result = (over: Partial<DiagnoseResult> = {}): DiagnoseResult => ({
  diagnostics: [],
  score: { score: 100, label: "Great", partial: false },
  scorePartial: false,
  skippedChecks: [],
  project,
  elapsedMilliseconds: 12,
  ...over,
});

/** A tiny rule catalog for `--explain` lookups. */
export const ruleCatalog: Record<string, RuleMeta> = {
  "no-any": {
    id: "no-any",
    severity: "warning",
    category: "type-safety",
    tier: "SYN",
    recommendation: "Replace `any` with a precise type.",
    fixKind: "manual",
  },
};

/** A capturing {@link InspectIo}: records stdout/stderr; serves a fixed result. */
export interface CapturingIo extends InspectIo {
  readonly out: string[];
  readonly err: string[];
  readonly fixCalls: Array<{ diagnostics: readonly Diagnostic[]; rootDir: string }>;
}

/**
 * Build a capturing IO seam. `diagnoseResult` is the canned `diagnose` output;
 * `applyResult` is what `--fix` returns (default: nothing applied).
 */
export const makeCapturingIo = (
  diagnoseResult: DiagnoseResult,
  applyResult: ApplyFilesResult = {
    filesChanged: 0,
    appliedCount: 0,
    skippedCount: 0,
  },
): CapturingIo => {
  const out: string[] = [];
  const err: string[] = [];
  const fixCalls: CapturingIo["fixCalls"] = [];
  return {
    out,
    err,
    fixCalls,
    stdout: (text) => Effect.sync(() => void out.push(text)),
    stderr: (text) => Effect.sync(() => void err.push(text)),
    diagnose: () => Effect.succeed(diagnoseResult),
    applyFixes: (diagnostics, rootDir) =>
      Effect.sync(() => {
        fixCalls.push({ diagnostics, rootDir });
        return applyResult;
      }),
    ruleCatalog,
  };
};

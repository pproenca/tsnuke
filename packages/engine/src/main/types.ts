/**
 * Orchestration types OWNED by `@tsnuke/engine-effect` — the `diagnose()`
 * options/result contract and the legacy `ScoreResult` shape. Faithful port of legacy
 * `legacy/tsnuke/packages/core/src/types.ts` (`DiagnoseOptions`, `DiagnoseResult`,
 * `ScoreResult`); `ProjectInfo` is OWNED by — and imported from — the discovery slice,
 * so it is re-exported as a type rather than re-declared.
 *
 * ⚠️ THE `band` → `label` MAPPING (RULE-018 partial-honesty boundary). The score slice
 * returns `{ score, band }` (a typed `ScoreBand` literal), NOT legacy's `{ score, label:
 * string }`. The legacy `ScoreResult` shape — `{ score, label, partial }` — is preserved
 * HERE: `diagnose` maps the slice's `band` → `label`, and wraps the engine's
 * `scorePartial` into `partial`. The score slice's `ScoreResult` stays partial-FREE (a
 * pure scoring fact); the engine is what knows whether the run was partial, so the engine
 * is what carries `partial`. See TRANSFORMATION_NOTES.md.
 */

import type { Diagnostic, OnProgress, TsNukeConfig } from "@tsnuke/contracts-effect";
import type { ProjectInfo } from "@tsnuke/discovery-effect";

export type { ProjectInfo };
export type { ProgressEvent, OnProgress } from "@tsnuke/contracts-effect";

/** The result of local scoring (§5, BC-01/04) — the LEGACY shape (label, not band). */
export interface ScoreResult {
  /** 0–100 integer. */
  readonly score: number;
  /** Band label: "Great" / "Needs work" / "Critical" (mapped from the slice's `band`). */
  readonly label: string;
  /** True when Tier-2 was skipped — score is on a different scale (RULE-018). */
  readonly partial: boolean;
}

/** Options for the top-level `diagnose()` entry point. */
export interface DiagnoseOptions {
  readonly lint?: boolean;
  readonly deadCode?: boolean;
  /** Force/skip Tier-2; default auto (runs iff `typecheck:ok`). */
  readonly deep?: boolean;
  readonly verbose?: boolean;
  /** Diff/staged narrowing: report only on these paths. */
  readonly includePaths?: string[];
  readonly respectInlineDisables?: boolean;
  /**
   * Pre-loaded config supplied by the caller. When set, `diagnose()` skips its own
   * `${directory}/tsnuke.config.json` lookup. `diagnoseWorkspace()` uses this to apply a
   * single workspace-root `tsnuke.config.json` uniformly across members.
   */
  readonly config?: TsNukeConfig;
  /**
   * Optional phase-level progress sink. Called synchronously at boundaries (discover,
   * read, build-program, tier-1, tier-2, graph, score, done). Defaults to a no-op; an
   * exception thrown by the sink is caught and discarded so a misbehaving renderer can
   * never poison the engine.
   */
  readonly onProgress?: OnProgress;
}

/**
 * One TypeScript pre-emit diagnostic. Surfaced to the agent (via the agent-format report)
 * so it has concrete files to fix in order to unlock Tier-2. The engine captures these
 * during the single `getPreEmitDiagnostics()` probe that derives `typecheck:ok`; nothing
 * about scoring or rule activation depends on the list — it is observability for the
 * agent loop.
 */
export interface TypecheckErrorInfo {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly code: number;
}

/** The result of a single-project `diagnose()` call (the public boundary). */
export interface DiagnoseResult {
  readonly diagnostics: Diagnostic[];
  readonly score: ScoreResult | null;
  /** True when Tier-2 was skipped (mirrors `score.partial`). */
  readonly scorePartial: boolean;
  readonly skippedChecks: string[];
  /** Per-skipped-check human reason, e.g. why TYP rules were skipped (RULE-018). */
  readonly skippedCheckReasons?: Record<string, string>;
  /**
   * Top-N TS pre-emit errors when the project failed to type-check. Empty / omitted when
   * the project compiled (Tier-2 ran), when `--no-deep` was passed, or when there were no
   * source files. The engine bounds the list; the format slice trims it further before
   * embedding into the agent payload.
   */
  readonly typecheckErrors?: ReadonlyArray<TypecheckErrorInfo>;
  readonly project: ProjectInfo;
  /** The ONE non-deterministic field (timing telemetry) — never feeds the score. */
  readonly elapsedMilliseconds: number;
}

/**
 * The result of a `diagnoseWorkspace()` call — the monorepo boundary (BC-05). Always
 * carries ≥1 project: a single-project directory yields one entry with `isWorkspace:
 * false` (so callers can render it exactly like a `diagnose()` result); a workspace ROOT
 * yields one entry per analyzable member with `isWorkspace: true`. The per-project
 * `DiagnoseResult`s are produced each under their OWN `Scope`, so no project's `ts.Program`
 * outlives its analysis (RULE-036 / BC-24). The BC-05 min-score rollup is the caller's
 * concern (the `build-report` slice already does it over `projects`).
 */
export interface WorkspaceResult {
  /** The directory `diagnoseWorkspace` was pointed at (absolute). */
  readonly rootDirectory: string;
  /** True when `rootDirectory` is a multi-package workspace (≥1 enumerated member). */
  readonly isWorkspace: boolean;
  /** One result per analyzed project (≥1), in deterministic directory order. */
  readonly projects: ReadonlyArray<DiagnoseResult>;
  /** Total wall-clock for the whole workspace run (sum of per-project, plus discovery). */
  readonly elapsedMilliseconds: number;
}

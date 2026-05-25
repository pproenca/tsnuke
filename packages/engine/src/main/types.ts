/**
 * Orchestration types OWNED by `@ts-doctor/engine-effect` — the `diagnose()`
 * options/result contract and the legacy `ScoreResult` shape. Faithful port of legacy
 * `legacy/ts-doctor/packages/core/src/types.ts` (`DiagnoseOptions`, `DiagnoseResult`,
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

import type { Diagnostic } from "@ts-doctor/contracts-effect";
import type { ProjectInfo } from "@ts-doctor/discovery-effect";

export type { ProjectInfo };

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
  readonly project: ProjectInfo;
  /** The ONE non-deterministic field (timing telemetry) — never feeds the score. */
  readonly elapsedMilliseconds: number;
}

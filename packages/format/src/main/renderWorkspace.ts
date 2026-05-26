/**
 * Pretty workspace report: per-project mini-rows (score + bar + counts) + a
 * BC-05 summary footer with the doctor-style header and a CTA pointing at the
 * worst member. Pure: returns a string.
 *
 * Decoupled from the engine slice — consumes a structural `WorkspaceView` that
 * mirrors what the renderer reads from `engine-effect`'s `WorkspaceResult`. The
 * CLI shell maps one onto the other and feeds in the precomputed `summary`
 * (the build-report rollup, which lives outside the format slice).
 */
import type { Diagnostic } from "@tsnuke/contracts-effect";
import { deriveNextAction, summarizeFixes } from "./nextAction.js";
import { renderHeader } from "./renderHeader.js";
import { renderPretty, type RenderScoreResult } from "./render.js";
import { bold, colorForScore, dim, formatDuration, gray } from "./theme.js";

/** One project's slice of a workspace render input. */
export interface WorkspaceProjectView {
  /** Absolute root directory of the project (the renderer prints it relative to the workspace). */
  readonly rootDirectory: string;
  /** Score result for the project, or `null` when unscored. */
  readonly score: RenderScoreResult | null;
  /** Tier-2 was skipped on this project (BC-03). */
  readonly scorePartial: boolean;
  readonly diagnostics: readonly Diagnostic[];
  /** Wall-clock for this project's analysis (ms). */
  readonly elapsedMilliseconds: number;
}

/** Structural input to `renderWorkspacePretty`. */
export interface WorkspaceView {
  readonly rootDirectory: string;
  readonly projects: ReadonlyArray<WorkspaceProjectView>;
  /** Wall-clock for the whole workspace run (ms). */
  readonly elapsedMilliseconds: number;
}

/** Optional knobs for the workspace renderer. */
export interface RenderWorkspaceOptions {
  readonly color?: boolean;
  readonly verbose?: boolean;
  readonly version?: string;
  readonly rulesChecked?: number;
  readonly showScore?: boolean;
}

const BAR_WIDTH = 22;

/** A member directory shown relative to the workspace root (root itself → "."). */
function relativeDir(root: string, dir: string): string {
  if (dir === root) return ".";
  if (dir.startsWith(`${root}/`)) return dir.slice(root.length + 1);
  return dir;
}

/** Pick the project pulling the score down (lowest score; null breaks ties to last). */
export function worstProject(ws: WorkspaceView): WorkspaceProjectView | undefined {
  return ws.projects.reduce<WorkspaceProjectView | undefined>(
    (acc, p) =>
      acc === undefined || (p.score?.score ?? 0) < (acc.score?.score ?? 0) ? p : acc,
    undefined,
  );
}

/** Render a single workspace row: `▸ packages/x   80 / 100   Great   ███░░░  …`. */
export function renderProjectRow(
  ws: WorkspaceView,
  p: WorkspaceProjectView,
  color: boolean,
): string {
  const dir = relativeDir(ws.rootDirectory, p.rootDirectory);
  const score = p.score?.score ?? null;
  const label = p.score?.label ?? "not scored";
  const errors = p.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = p.diagnostics.length - errors;

  const filled = score === null ? 0 : Math.round((score / 100) * BAR_WIDTH);
  const bar =
    score === null
      ? dim(color, "░".repeat(BAR_WIDTH))
      : colorForScore(score, color, "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled));

  const scoreText =
    score === null
      ? gray(color, "  -- / 100")
      : bold(color, colorForScore(score, color, `${String(score).padStart(3, " ")} / 100`));
  const mark = p.scorePartial && score !== null ? "*" : " ";
  const labelText =
    score === null
      ? gray(color, label)
      : colorForScore(score, color, p.scorePartial ? `${label}*` : label);

  const counts =
    p.diagnostics.length === 0
      ? dim(color, "clean")
      : dim(color, `${errors} err · ${warnings} warn`);

  return (
    `  ${dim(color, "▸")} ${dir.padEnd(24, " ")}` +
    ` ${scoreText}${mark} ${labelText.padEnd(14, " ")}` +
    ` ${bar}  ${counts}`
  );
}

/**
 * Render the pretty workspace report. The `summary` score is the BC-05 min-of
 * rollup — precomputed by the caller because it depends on `build-report-effect`,
 * which the format slice doesn't depend on.
 */
export function renderWorkspacePretty(
  ws: WorkspaceView,
  summary: RenderScoreResult | null,
  options: RenderWorkspaceOptions = {},
): string {
  const color = options.color ?? false;
  const verbose = options.verbose ?? false;
  const showScore = options.showScore ?? true;
  const version = options.version;
  const rulesChecked = options.rulesChecked ?? 0;
  const all = ws.projects.flatMap((p) => [...p.diagnostics]);
  const errors = all.filter((d) => d.severity === "error").length;
  const warnings = all.length - errors;
  const fixes = summarizeFixes(all);

  const lines: string[] = [];

  if (showScore) {
    const tagline =
      version !== undefined
        ? `tsnuke · ${version}  ·  workspace score = min of ${ws.projects.length}`
        : `workspace score = min of ${ws.projects.length}`;
    lines.push(
      bold(color, `  Workspace  ${ws.rootDirectory}  ·  ${ws.projects.length} project(s)`),
      "",
      ...ws.projects.map((p) => renderProjectRow(ws, p, color)),
      "",
      renderHeader({
        score: summary?.score ?? null,
        label: summary?.label ?? null,
        partial: summary?.partial ?? false,
        tagline,
        color,
      }),
      "",
    );
  }

  if (verbose) {
    lines.push(
      ...ws.projects.flatMap((p) => [
        dim(color, `── ${relativeDir(ws.rootDirectory, p.rootDirectory)} ──`),
        renderPretty(p.diagnostics, p.score, p.scorePartial, {
          color,
          verbose: true,
          ...(version !== undefined ? { version } : {}),
          elapsedMs: p.elapsedMilliseconds,
          rulesChecked,
          showScore: false,
          repoRoot: p.rootDirectory,
        }),
        "",
      ]),
    );
  }

  const stats =
    `  ${bold(color, `${all.length} issue${all.length === 1 ? "" : "s"}`)} ` +
    `across ${ws.projects.length} project(s) · ` +
    `${errors} err · ${warnings} warn · ${formatDuration(ws.elapsedMilliseconds)}`;
  lines.push(stats);

  if (all.length === 0) {
    lines.push(`  ${dim(color, "✓ All clear — every project is clean.")}`);
    return lines.join("\n");
  }

  const next = deriveNextAction(all);
  const worst = worstProject(ws);
  const ctaTail =
    worst !== undefined && (worst.score?.score ?? 100) < (summary?.score ?? 100)
      ? ` ${dim(color, `(open ${relativeDir(ws.rootDirectory, worst.rootDirectory)} first — it pulls the score down)`)}`
      : "";
  const detail =
    next.kind === "run-fix"
      ? ` ${dim(color, `(${fixes.codemod} codemod, ${fixes.manual} manual remaining)`)}`
      : "";
  lines.push(`  ${dim(color, "→")} ${next.summary}${detail}${ctaTail}`);

  return lines.join("\n");
}

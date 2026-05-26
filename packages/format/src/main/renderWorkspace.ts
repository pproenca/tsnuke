/**
 * Pretty workspace report — the human surface of a monorepo run.
 *
 * Layout (color stripped):
 *   Workspace  ~/Documents/Projects/tsnuke  ·  32 projects  ·  93/100* Great
 *   ────────────────────────────────────────────────────────────────────────
 *   WORST                              score    err   warn
 *   ▸ discovery                          93*     1     42
 *   ▸ rules-core                         95      2      9
 *   …
 *   … 25 more projects ≥ 96  (--all to expand)
 *
 *   1,076 issues · 15 err · 1,061 warn · 27.1s · tsnuke 0.3.0
 *   → Start with `no-non-null-assertion` (412 occurrences across 12 projects)
 *   * partial score (Tier-2 type info unavailable)
 *
 * Decoupled from the engine slice — consumes a structural `WorkspaceView` that the CLI
 * shell maps onto from `engine-effect`'s `WorkspaceResult`. Pure: returns a string.
 *
 * Design vs. the legacy panel (the 4-line nuke icon + per-row 22-cell bar): in workspace
 * mode every row carries an identical-looking bar (scores live in a narrow 93–99 band),
 * the band label "Great" repeats 32×, and dirs longer than 24 chars break alignment. This
 * renderer instead sorts worst-first, drops the bar + label columns, right-aligns numeric
 * columns at dynamic widths, and truncates to a top-N by default (expand with `--all`).
 */
import type { Diagnostic } from "@tsnuke/contracts-effect";
import { deriveNextAction, summarizeFixes } from "./nextAction.js";
import { renderPretty, type RenderScoreResult } from "./render.js";
import { bold, colorForScore, dim, formatDuration, gray, red, yellow } from "./theme.js";

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
  /** When true, show ALL projects in the table (default: top-N truncation). */
  readonly showAll?: boolean;
  /** Home directory used to tilde-ify the workspace path (`~/foo`). CLI fills this; pure. */
  readonly homeDir?: string;
}

/** How many worst projects to show by default before collapsing the tail. */
const TOP_N = 7;
/** Width of the horizontal rule under the workspace header. */
const RULE_WIDTH = 72;

/** A member directory shown relative to the workspace root (root itself → "."). */
function relativeDir(root: string, dir: string): string {
  if (dir === root) return ".";
  if (dir.startsWith(`${root}/`)) return dir.slice(root.length + 1);
  return dir;
}

/** Replace a `~` prefix when `dir` is inside `home`. Pure (no `os.homedir` call). */
function tildify(dir: string, home: string | undefined): string {
  if (home === undefined || home.length === 0) return dir;
  if (dir === home) return "~";
  if (dir.startsWith(`${home}/`)) return `~/${dir.slice(home.length + 1)}`;
  return dir;
}

/** Count error-severity diagnostics. */
function countErrors(d: readonly Diagnostic[]): number {
  return d.filter((x) => x.severity === "error").length;
}

/** Format an integer with thousands separators (locale-free, ASCII). */
function thousands(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Sort projects worst-first: lower score → more errors → more total → name. Stable. */
function compareWorstFirst(a: WorkspaceProjectView, b: WorkspaceProjectView): number {
  const aScore = a.score?.score ?? -1;
  const bScore = b.score?.score ?? -1;
  if (aScore !== bScore) return aScore - bScore;
  const aErr = countErrors(a.diagnostics);
  const bErr = countErrors(b.diagnostics);
  if (aErr !== bErr) return bErr - aErr;
  if (a.diagnostics.length !== b.diagnostics.length)
    return b.diagnostics.length - a.diagnostics.length;
  return a.rootDirectory.localeCompare(b.rootDirectory);
}

/** Count occurrences of `rule` across the workspace + the number of distinct projects. */
function focusRuleDistribution(
  ws: WorkspaceView,
  focusRule: string,
): { occurrences: number; projectCount: number } {
  return ws.projects.reduce(
    (acc, p) => {
      const hits = p.diagnostics.filter((d) => d.rule === focusRule).length;
      if (hits === 0) return acc;
      return { occurrences: acc.occurrences + hits, projectCount: acc.projectCount + 1 };
    },
    { occurrences: 0, projectCount: 0 },
  );
}

/** Pick the project pulling the score down (lowest score; null breaks ties to last). */
export function worstProject(ws: WorkspaceView): WorkspaceProjectView | undefined {
  return ws.projects.reduce<WorkspaceProjectView | undefined>(
    (acc, p) =>
      acc === undefined || (p.score?.score ?? 0) < (acc.score?.score ?? 0) ? p : acc,
    undefined,
  );
}

/** Format one project's table row (dir + score + err + warn), pre-aligned. */
function formatRow(
  ws: WorkspaceView,
  p: WorkspaceProjectView,
  widths: { dir: number; score: number; err: number; warn: number },
  color: boolean,
): string {
  const dir = relativeDir(ws.rootDirectory, p.rootDirectory).padEnd(widths.dir, " ");
  const score = p.score?.score ?? null;
  const partial = p.scorePartial && score !== null;
  const scoreRaw = score === null ? "--" : `${score}${partial ? "*" : ""}`;
  const scoreCell = scoreRaw.padStart(widths.score, " ");
  const scoreText =
    score === null
      ? gray(color, scoreCell)
      : bold(color, colorForScore(score, color, scoreCell));

  const errN = countErrors(p.diagnostics);
  const warnN = p.diagnostics.length - errN;
  const errCell = String(errN).padStart(widths.err, " ");
  const warnCell = String(warnN).padStart(widths.warn, " ");
  const errText = errN === 0 ? dim(color, errCell) : red(color, errCell);
  const warnText = warnN === 0 ? dim(color, warnCell) : yellow(color, warnCell);

  return `  ${dim(color, "▸")} ${dir}  ${scoreText}  ${errText}  ${warnText}`;
}

/** Render the one-line workspace summary header (path · count · score band). */
function renderSummaryLine(
  ws: WorkspaceView,
  summary: RenderScoreResult | null,
  color: boolean,
  home: string | undefined,
): string {
  const path = tildify(ws.rootDirectory, home);
  const count = `${ws.projects.length} project${ws.projects.length === 1 ? "" : "s"}`;
  const sep = `  ${dim(color, "·")}  `;
  if (summary === null) {
    return `  ${bold(color, "Workspace")}  ${path}${sep}${count}${sep}${gray(color, "n/a")}`;
  }
  const star = summary.partial ? "*" : "";
  const num = `${summary.score}/100${star}`;
  const scoreText = `${bold(color, colorForScore(summary.score, color, num))} ${colorForScore(summary.score, color, summary.label)}`;
  return `  ${bold(color, "Workspace")}  ${path}${sep}${count}${sep}${scoreText}`;
}

/**
 * Render the pretty workspace report. The `summary` score is the BC-05 min-of rollup —
 * precomputed by the caller because it depends on `build-report-effect`, which the format
 * slice doesn't depend on.
 */
export function renderWorkspacePretty(
  ws: WorkspaceView,
  summary: RenderScoreResult | null,
  options: RenderWorkspaceOptions = {},
): string {
  const color = options.color ?? false;
  const verbose = options.verbose ?? false;
  const showScore = options.showScore ?? true;
  const showAll = options.showAll ?? false;
  const version = options.version;
  const home = options.homeDir;
  const rulesChecked = options.rulesChecked ?? 0;

  const sorted = [...ws.projects].sort(compareWorstFirst);
  const all = sorted.flatMap((p) => [...p.diagnostics]);
  const errors = countErrors(all);
  const warnings = all.length - errors;
  const partialAny = sorted.some((p) => p.scorePartial);
  const fixes = summarizeFixes(all);

  const lines: string[] = [];

  // 1. One-line summary header (replaces the 4-line nuke panel for workspace mode).
  if (showScore) {
    lines.push(renderSummaryLine(ws, summary, color, home));
    lines.push(`  ${dim(color, "─".repeat(RULE_WIDTH))}`);
  }

  // 2. Decide truncation. Verbose shows ALL projects (each gets a full report below).
  const collapsed = !showAll && !verbose && sorted.length > TOP_N + 1;
  const shown = collapsed ? sorted.slice(0, TOP_N) : sorted;
  const hidden = sorted.length - shown.length;
  const tailScore =
    collapsed && shown.length > 0 ? (shown[shown.length - 1]?.score?.score ?? null) : null;

  // 3. Dynamic column widths over the rows we'll actually print.
  const dirWidth = Math.max(
    "WORST".length,
    ...shown.map((p) => relativeDir(ws.rootDirectory, p.rootDirectory).length),
  );
  const errWidth = Math.max(
    "err".length,
    ...shown.map((p) => String(countErrors(p.diagnostics)).length),
  );
  const warnWidth = Math.max(
    "warn".length,
    ...shown.map((p) => String(p.diagnostics.length - countErrors(p.diagnostics)).length),
  );
  // "100*" is the widest score cell; allow "n/a" / "--" too.
  const scoreWidth = 5;

  // Header row.
  lines.push(
    `  ${dim(color, "WORST".padEnd(dirWidth, " "))}` +
      `  ${dim(color, "score".padStart(scoreWidth, " "))}` +
      `  ${dim(color, "err".padStart(errWidth, " "))}` +
      `  ${dim(color, "warn".padStart(warnWidth, " "))}`,
  );

  // Project rows.
  const widths = { dir: dirWidth, score: scoreWidth, err: errWidth, warn: warnWidth };
  lines.push(...shown.map((p) => formatRow(ws, p, widths, color)));

  // Truncation hint line.
  if (collapsed && tailScore !== null) {
    lines.push(
      `  ${dim(color, `… ${hidden} more project${hidden === 1 ? "" : "s"} ≥ ${tailScore}`)}` +
        `  ${dim(color, "(--all to expand)")}`,
    );
  }

  // 4. Verbose: full per-project reports beneath the table.
  if (verbose) {
    lines.push("");
    lines.push(
      ...sorted.flatMap((p) => [
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

  // 5. Footer stats + CTA.
  lines.push("");
  const sep = `  ${dim(color, "·")}  `;
  const versionTail = version !== undefined ? `${sep}${dim(color, `tsnuke ${version}`)}` : "";
  const stats =
    `  ${bold(color, `${thousands(all.length)} issue${all.length === 1 ? "" : "s"}`)}` +
    `${sep}${thousands(errors)} err${sep}${thousands(warnings)} warn` +
    `${sep}${formatDuration(ws.elapsedMilliseconds)}${versionTail}`;
  lines.push(stats);

  if (all.length === 0) {
    lines.push(`  ${dim(color, "✓ All clear — every project is clean.")}`);
  } else {
    const next = deriveNextAction(all);
    if (next.kind === "address-rule" && next.focusRule !== undefined) {
      const dist = focusRuleDistribution(ws, next.focusRule);
      const where =
        dist.projectCount === 1 ? "in 1 project" : `across ${dist.projectCount} projects`;
      lines.push(
        `  ${dim(color, "→")} Start with \`${next.focusRule}\` ` +
          dim(
            color,
            `(${thousands(dist.occurrences)} occurrence${dist.occurrences === 1 ? "" : "s"} ${where})`,
          ),
      );
    } else if (next.kind === "run-fix") {
      lines.push(
        `  ${dim(color, "→")} ${next.summary} ${dim(color, `(${fixes.codemod} codemod, ${fixes.manual} manual remaining)`)}`,
      );
    } else {
      lines.push(`  ${dim(color, "→")} ${next.summary}`);
    }
  }

  // 6. Partial-score legend (only when any project carries a partial mark). Runs
  // regardless of clean/dirty so the `*` in the header always has an explanation.
  if (partialAny) {
    lines.push(`  ${dim(color, "* partial score (Tier-2 type info unavailable)")}`);
  }

  return lines.join("\n");
}

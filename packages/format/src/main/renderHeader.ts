/**
 * The score header — a 4-line ASCII panel whose right column carries the score,
 * label, and progress bar; the left column shows a nuke-themed status icon that
 * grows more violent as the score drops. Pure: returns the rendered string.
 *
 * Layout (color stripped):
 *   ╭─────╮      82 / 100   Great
 *   │ ╔═╗ │      ██████████████████░░
 *   │ ╚═╝ │      tsnuke · 0.2.0
 *   ╰─────╯
 *
 * Bands → icon + bar colour (RULE-002 thresholds):
 *   ≥ 75  green    ╔═╗ ╚═╝   warhead contained — code is clean, no nuke needed
 *   ≥ 50  yellow   ░░░ ╲│╱   smoke rising — early warning
 *   <  50 red      ▓█▓ ╱│╲   mushroom cloud — code has been nuked
 *
 * Partial scores (Tier-2 skipped, BC-03): the bar is dimmed and a `*` is appended,
 * the label becomes `Partial — type info unavailable`. Score `null` ⇒ a "not run"
 * card. No animation: the file remains pure and snapshot-stable.
 */
import { bold, colorForScore, dim, gray } from "./theme.js";

const BAR_WIDTH = 20;

export interface ScoreHeaderInput {
  /** 0–100 score, or null when unscored. */
  readonly score: number | null;
  /** Band label ("Great" / "Needs work" / "Critical"). */
  readonly label: string | null;
  /** Tier-2 skipped → partial scale (BC-03). */
  readonly partial: boolean;
  /** Optional tag line under the bar (e.g. `tsnuke · 0.2.0`). */
  readonly tagline?: string;
  /** Enable ANSI colour. */
  readonly color: boolean;
}

/**
 * Pick the 2-line nuke-status icon for the given score band. Stable across colour
 * on/off; each row is exactly 3 cells so the panel walls stay aligned.
 *
 *   null     ` ? ` / ` - `   not run
 *   ≥ 75     `╔═╗` / `╚═╝`   warhead in silo — nothing to nuke
 *   ≥ 50     `░░░` / `╲│╱`   smoke + early plume
 *   <  50    `▓█▓` / `╱│╲`   mushroom cap + flaring stem
 */
function faceFor(score: number | null): readonly [string, string] {
  if (score === null) return [" ? ", " - "];
  if (score >= 75) return ["╔═╗", "╚═╝"];
  if (score >= 50) return ["░░░", "╲│╱"];
  return ["▓█▓", "╱│╲"];
}

/** Render the bar string (filled `█`, empty `░`), 20 chars wide. */
function buildBar(score: number | null, color: boolean): string {
  if (score === null) {
    return dim(color, "░".repeat(BAR_WIDTH));
  }
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round((score / 100) * BAR_WIDTH)));
  const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
  return colorForScore(score, color, bar);
}

/** Render the nuke-status score header. Returns 4 lines joined by `\n`. */
export function renderHeader(input: ScoreHeaderInput): string {
  const { score, label, partial, tagline, color } = input;
  const [faceTop, faceBot] = faceFor(score);

  const scoreText =
    score === null ? "  -- / 100" : `${String(score).padStart(3, " ")} / 100`;
  const partialMark = partial && score !== null ? "*" : " ";
  const scoreCol =
    score === null ? gray(color, scoreText) : bold(color, colorForScore(score, color, scoreText));

  const labelText =
    label === null
      ? gray(color, "not scored")
      : partial
        ? `${label}*  (partial — type info unavailable)`
        : label;
  const labelCol =
    score === null ? labelText : colorForScore(score, color, labelText);

  const bar = buildBar(score, color);
  const dimmedBar = partial ? dim(color, bar) : bar;
  const tag = tagline !== undefined ? dim(color, tagline) : "";

  const left1 = "  ╭─────╮     ";
  const left2 = `  │ ${faceTop} │     `;
  const left3 = `  │ ${faceBot} │     `;
  const left4 = "  ╰─────╯     ";

  return [
    `${left1} ${scoreCol}${partialMark} ${labelCol}`,
    `${left2} ${dimmedBar}`,
    `${left3} ${tag}`,
    left4,
  ].join("\n");
}

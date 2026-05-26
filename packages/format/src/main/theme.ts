/**
 * Tiny pure ANSI palette. The format slice never touches `process` or env — the CLI
 * decides whether colour is on and passes a boolean in. When `color === false`,
 * every helper is the identity function, so a captured non-TTY string is plain ASCII
 * and snapshot-stable.
 *
 * No dependency: the few SGR escapes we use are stable across every terminal worth
 * supporting and cheap to inline.
 */

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

const wrap = (sgr: string) => (color: boolean, text: string): string =>
  color ? `${ESC}${sgr}m${text}${RESET}` : text;

export const red = wrap("31");
export const green = wrap("32");
export const yellow = wrap("33");
export const blue = wrap("34");
export const magenta = wrap("35");
export const cyan = wrap("36");
export const gray = wrap("90");
export const dim = wrap("2");
export const bold = wrap("1");

/** Colour a band label / score number by its band. */
export function colorForScore(score: number, color: boolean, text: string): string {
  if (score >= 75) return green(color, text);
  if (score >= 50) return yellow(color, text);
  return red(color, text);
}

/** Human-readable wall-clock duration: `0s` / `420ms` / `1.23s` / `25.1s`. Pure. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return `${s.toFixed(s < 10 ? 2 : 1)}s`;
}

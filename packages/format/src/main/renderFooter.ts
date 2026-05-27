/**
 * Footer line + CTA.
 *
 *   4 issues across 3 files · 88 rules checked · 0.42s
 *   → Run `tsnuke --fix` to auto-resolve 2 issue(s); 0 codemod(s), 2 manual.
 *
 * The second line comes from `deriveNextAction` so the agent JSON `nextAction.summary`
 * and the human CTA match byte-for-byte (modulo the leading `→`).
 */
import type { Diagnostic } from "@tsnuke/contracts-effect";
import type { FixSummary, NextAction } from "./nextAction.js";
import { bold, dim, formatDuration } from "./theme.js";

export interface FooterInput {
  readonly diagnostics: readonly Diagnostic[];
  readonly fixSummary: FixSummary;
  readonly nextAction: NextAction;
  readonly rulesChecked: number;
  readonly elapsedMs: number;
  readonly color: boolean;
}

function affectedFileCount(diagnostics: readonly Diagnostic[]): number {
  return new Set(diagnostics.map((d) => d.filePath)).size;
}

/** Render the two-line footer (stats line + CTA). Returns the joined string. */
export function renderFooter(input: FooterInput): string {
  const { diagnostics, fixSummary, nextAction, rulesChecked, elapsedMs, color } = input;
  const files = affectedFileCount(diagnostics);
  const noun = diagnostics.length === 1 ? "issue" : "issues";
  const fileNoun = files === 1 ? "file" : "files";
  const ruleNoun = rulesChecked === 1 ? "rule" : "rules";

  const stats =
    `${bold(color, `${diagnostics.length} ${noun}`)} across ${files} ${fileNoun} · ` +
    `${rulesChecked} ${ruleNoun} checked · ${formatDuration(elapsedMs)}`;

  // CTA is only meaningful when there's a follow-up to take.
  if (diagnostics.length === 0) {
    return `  ${stats}\n  ${dim(color, "✓ All clear — no issues found.")}`;
  }

  // Suffix detail when --fix can do useful work.
  const detail =
    nextAction.kind === "run-fix"
      ? ` ${dim(color, `(${fixSummary.codemod} codemod, ${fixSummary.manual} manual remaining)`)}`
      : "";

  return `  ${stats}\n  ${dim(color, "→")} ${nextAction.summary}${detail}`;
}

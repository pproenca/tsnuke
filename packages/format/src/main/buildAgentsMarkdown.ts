/**
 * Build the AGENTS.md-style discovery payload for tsnuke. PURE: `rules → markdown`
 * — no IO, no `process`. Used by two callers:
 *
 *   - `tsnuke agents` (CLI) — prints this to stdout so an AI agent that runs
 *     `npx -y tsnuke agents` gets a single self-contained briefing covering what
 *     the tool is, how to invoke it, exit codes, output formats, and the full
 *     rule catalog.
 *   - `tsnuke install` (CLI) — writes this to `.agent/skills/tsnuke/SKILL.md`,
 *     so projects that commit the skill get the same briefing under
 *     `.agent/skills/`.
 *
 * Keeping a SINGLE builder for both eliminates drift: the on-disk SKILL.md and
 * the on-demand `agents` payload are byte-identical.
 *
 * The payload front-matter follows the emerging AGENTS.md convention (used by
 * Claude Code skills + Cursor); `triggers:` is the same heuristic the prior
 * `buildSkillMarkdown` already shipped.
 */

import type { RuleMeta } from "@tsnuke/contracts-effect";

/** Inputs for {@link buildAgentsMarkdown}. */
export interface BuildAgentsMarkdownInput {
  /** All rules tsnuke ships (per-file + graph). The builder sorts them by id. */
  readonly rules: ReadonlyArray<RuleMeta>;
  /** Optional version string to embed in the payload. Default omitted. */
  readonly version?: string;
}

/** Render the AGENTS.md-style markdown briefing. Deterministic; no IO. */
export function buildAgentsMarkdown(input: BuildAgentsMarkdownInput): string {
  const lines: string[] = [];
  const versionLine = input.version !== undefined ? `tsnuke ${input.version} — ` : "";

  // ── Front-matter ──────────────────────────────────────────────────────────
  lines.push(
    "---",
    "name: tsnuke",
    "description: >-",
    "  Run a TypeScript health check before finishing a change. Surfaces type-safety,",
    "  async, module-boundary, and strictness issues with machine-applicable fixes.",
    "triggers:",
    "  - after editing one or more .ts/.tsx files",
    "  - before opening a PR or pushing",
    "  - when asked to 'check types' or 'audit the TypeScript'",
    "---",
    "",
    "# tsnuke — agent briefing",
    "",
    `${versionLine}A local, deterministic, offline TypeScript code-health linter + 0–100 scorer.`,
    "Two-tier engine over the in-process TypeScript compiler: SYN/GRAPH/CFG always run; TYP runs when the project type-checks.",
    "",
  );

  // ── Recipes ──────────────────────────────────────────────────────────────
  lines.push(
    "## Recipes (cheapest action first)",
    "",
    "Get a deduplicated, fix-sorted JSON report — the agent's default invocation:",
    "",
    "```sh",
    "npx -y tsnuke --format agent",
    "```",
    "",
    "Apply safe auto-fixes, then re-scan and loop until the score stops improving:",
    "",
    "```sh",
    "npx -y tsnuke --fix --format agent",
    "```",
    "",
    "Regression-check only what changed against the base branch:",
    "",
    "```sh",
    "npx -y tsnuke --diff --format agent",
    "```",
    "",
    "Just the score (exit 0 always):",
    "",
    "```sh",
    "npx -y tsnuke --score",
    "```",
    "",
    "Explain why a specific diagnostic fired (offline, never gates):",
    "",
    "```sh",
    "npx -y tsnuke --explain path/to/file.ts:42",
    "```",
    "",
  );

  // ── Output format ────────────────────────────────────────────────────────
  lines.push(
    "## Output format (`--format agent`)",
    "",
    "Top-level keys: `score`, `scoreLabel`, `scorePartial`, `ruleCount`, `occurrenceCount`,",
    "`elapsedMs`, `fixSummary` (`autoFixable` / `codemod` / `manual`), `tierBreakdown`",
    "(SYN/TYP/GRAPH/CFG → `rules` + `occurrences`), `nextAction` (`kind` + `summary` +",
    "`autoFixableRules[]`), and `categories[]`. Each category groups its `rules[]`,",
    "each rule groups `occurrences[]` with `filePath`/`line`/`column`. Diagnostics are",
    "rule-deduplicated and sorted cheapest-action-first: auto-fix → codemod → manual.",
    "",
    "`scorePartial: true` means Tier-2 (type-aware) was skipped — the score is on a",
    "DIFFERENT scale and is NOT directly comparable to a full-tier score. Run the",
    "project's type-check before comparing scores across runs.",
    "",
  );

  // ── Exit codes ───────────────────────────────────────────────────────────
  lines.push(
    "## Exit codes",
    "",
    "- `0` — no diagnostics at or above `--fail-on` (default: `error`)",
    "- `1` — gate tripped, or engine error",
    "- `130` — interrupted (SIGINT/SIGTERM)",
    "",
  );

  // ── Key flags ────────────────────────────────────────────────────────────
  lines.push(
    "## Key flags",
    "",
    "| Flag | What it does |",
    "| --- | --- |",
    "| `--format agent` | Deduplicated, fix-sorted JSON (the agent default). |",
    "| `--format json` | Versioned `JsonReportV1` (machine-stable schema). |",
    "| `--score` | Print the score line only; never gates (exit 0). |",
    "| `--fix` | Apply safe auto-fix edits in place; atomic, symlink-safe. |",
    "| `--deep` / `--no-deep` | Force / skip the type-aware Tier-2 pass. Omit to auto-decide. |",
    "| `--diff [base]` | Scan only files changed against `base` (default: merge-base of main). |",
    "| `--staged` | Scan only staged files. |",
    "| `--fail-on error\\|warning\\|none` | Exit-code gate (default: `error`). |",
    "| `--explain <file:line>` | Offline, deterministic explanation of a diagnostic. |",
    "| `--project a,b` | Narrow workspace scan to the named projects. |",
    "",
  );

  // ── Rule catalog ─────────────────────────────────────────────────────────
  lines.push(
    "## Rule catalog",
    "",
    `Total: ${input.rules.length} rules. Sorted by id.`,
    "",
    "| id | category | tier | severity | fix | recommendation |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  const sorted = [...input.rules].sort((a, b) => a.id.localeCompare(b.id));
  for (const r of sorted) {
    const fix = r.fixKind ?? "manual";
    const recommendation = (r.recommendation ?? r.message ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(`| ${r.id} | ${r.category} | ${r.tier} | ${r.severity} | ${fix} | ${recommendation} |`);
  }
  lines.push("");

  // ── MCP server ───────────────────────────────────────────────────────────
  lines.push(
    "## MCP server",
    "",
    "tsnuke also ships a stdio MCP server (`tsnuke-mcp`) exposing three tools to coding agents:",
    "`tsnuke_diagnose(directory, deep?)`, `tsnuke_explain(rule)`, `tsnuke_list_rules()`.",
    "Wire it into Claude Code / Cursor with a stdio entry pointing at `npx -y tsnuke-mcp`.",
    "",
  );

  return lines.join("\n");
}

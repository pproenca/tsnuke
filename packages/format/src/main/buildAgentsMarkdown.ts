/**
 * Build the AGENTS.md-style discovery payload for tsnuke. PURE: `rules → markdown`
 * — no IO, no `process`. Used by two callers:
 *
 *   - `tsnuke agents` (CLI) — prints this to stdout so an AI agent that runs
 *     `npx -y tsnuke agents` gets a single self-contained briefing.
 *   - `tsnuke install` (CLI) — writes this to `.agent/skills/tsnuke/SKILL.md`,
 *     so projects that commit the skill get the same briefing locally.
 *
 * Layout:
 *   - Front-matter (name / description / triggers) — discovery surface for agent
 *     hosts (Claude Code skills, Cursor).
 *   - The canonical PLAYBOOK (`prompts/agent.md`, mirrored as a TS constant in
 *     `playbook.const.ts`). This is the same content served from
 *     `https://pproenca.dev/tsnuke/prompts/agent.md` once that deploy lands; the
 *     skill bundle inlines it so the playbook works offline.
 *   - A short rule index (rule IDs grouped by category) + the URL pattern for the
 *     per-rule prompts the playbook fetches on demand. The full rule TABLE
 *     (98 rows of severity/tier/fixKind/recommendation) is not inlined — it's
 *     reference material, not playbook content, and inflated SKILL.md to the
 *     point where agents skimmed past the actual instructions.
 *   - MCP server hint.
 *
 * Keeping a SINGLE builder for both callers eliminates drift between the
 * on-disk SKILL.md and the on-demand `agents` payload.
 */

import type { RuleMeta } from "@tsnuke/contracts-effect";
import { PLAYBOOK_MARKDOWN } from "./playbook.const.js";

/** Inputs for {@link buildAgentsMarkdown}. */
export interface BuildAgentsMarkdownInput {
  /** All rules tsnuke ships (per-file + graph). The builder sorts them by id. */
  readonly rules: ReadonlyArray<RuleMeta>;
  /** Optional version string to embed in the payload. Default omitted. */
  readonly version?: string;
  /**
   * Override the bundled playbook content (mostly for tests; production callers
   * leave this undefined and use {@link PLAYBOOK_MARKDOWN}).
   */
  readonly playbook?: string;
}

/** Render the AGENTS.md-style markdown briefing. Deterministic; no IO. */
export function buildAgentsMarkdown(input: BuildAgentsMarkdownInput): string {
  const playbook = input.playbook ?? PLAYBOOK_MARKDOWN;
  const versionLine = input.version !== undefined ? `\n> Bundled with tsnuke ${input.version}.\n` : "";
  const lines: string[] = [];

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
    "  - when the user types '/tsnuke' or asks to 'run tsnuke'",
    "---",
    "",
  );

  // ── Live-update + playbook ────────────────────────────────────────────────
  // The canonical playbook is the source of truth — same content that'll be
  // served from pproenca.dev once that deploy lands. Always inlined here so the
  // skill works offline.
  lines.push(playbook.trimEnd(), "", versionLine.trimEnd(), "");

  // ── Rule index (short) ────────────────────────────────────────────────────
  // The full catalog table is reference material the agent fetches per-rule via
  // `https://pproenca.dev/tsnuke/prompts/rules/<rule-id>.md`. The skill bundle
  // ships only the index (rule IDs grouped by category) so an agent can scan the
  // catalog at a glance without paying the token cost of the full table.
  lines.push("## Rule index", "");
  const byCategory = new Map<string, RuleMeta[]>();
  for (const r of [...input.rules].sort((a, b) => a.id.localeCompare(b.id))) {
    const bucket = byCategory.get(r.category) ?? [];
    if (!byCategory.has(r.category)) byCategory.set(r.category, bucket);
    bucket.push(r);
  }
  const categories = [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
  lines.push(`Total: ${input.rules.length} rules across ${categories.length} categories.`, "");
  lines.push(
    ...categories.map(
      ([category, rules]) =>
        `- **${category}** (${rules.length}): ${rules.map((r) => `\`${r.id}\``).join(", ")}`,
    ),
  );
  lines.push(
    "",
    "Fetch a rule's canonical fix prompt on demand:",
    "",
    "```sh",
    'curl --silent --fail "https://pproenca.dev/tsnuke/prompts/rules/$rule.md"',
    "```",
    "",
  );

  // ── MCP server hint ───────────────────────────────────────────────────────
  lines.push(
    "## MCP server",
    "",
    "tsnuke also ships a stdio MCP server (`tsnuke-mcp`) exposing three tools:",
    "`tsnuke_diagnose(directory, deep?)`, `tsnuke_explain(rule)`, `tsnuke_list_rules()`.",
    "Wire it into Claude Code / Cursor with a stdio entry pointing at `npx -y tsnuke-mcp`.",
    "",
  );

  return lines.join("\n");
}

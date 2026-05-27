/**
 * The `agents` subcommand — emit the AGENTS.md-style discovery payload to stdout.
 *
 * Runs against ZERO project state: no engine run, no FileSystem reads, no scope.
 * An AI agent that types `npx -y tsnuke agents` outside any project (or before
 * cloning one) still gets the full briefing — tool description, recipes, exit
 * codes, output format, full rule catalog, MCP setup snippet.
 *
 * Markdown content is built by the shared `buildAgentsMarkdown` (format slice);
 * the same builder feeds the `SKILL.md` written by `tsnuke install`, so the
 * on-demand briefing and the on-disk skill never drift.
 */

import { Command } from "@effect/cli";
import { Terminal } from "@effect/platform";
import { Effect } from "effect";
import type { RuleMeta } from "@tsnuke/contracts-effect";
import { buildAgentsMarkdown } from "@tsnuke/format-effect";
import { graphRuleRegistry, ruleRegistry } from "@tsnuke/rules-registry-effect";
import { VERSION } from "./inspectCommand.js";

/**
 * Print the AGENTS.md briefing for the global tsnuke rule catalog. Pure body +
 * one `Terminal.display` call — exit 0 always. Wrapped with `Effect.fn` so the
 * call shows up in Effect traces under `Cli.agents`, matching `Cli.install` /
 * `Cli.inspect` / `Engine.*` on the rest of the codebase.
 */
const handleAgents = Effect.fn("Cli.agents")(function* () {
  const terminal = yield* Terminal.Terminal;
  const rules: ReadonlyArray<RuleMeta> = [...ruleRegistry, ...graphRuleRegistry];
  const md = buildAgentsMarkdown({ rules, version: VERSION });
  yield* terminal.display(`${md}\n`).pipe(Effect.orDie);
  process.exitCode = 0;
});

export const agentsCommand = Command.make("agents", {}, () => handleAgents()).pipe(
  Command.withDescription(
    "Print an AGENTS.md-style briefing for AI agents (recipes, exit codes, rule catalog, MCP setup).",
  ),
);

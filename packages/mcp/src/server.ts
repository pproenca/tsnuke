#!/usr/bin/env node
/**
 * ts-doctor MCP server (stdio) — exposes the linter to coding agents.
 *
 * Tools:
 *   - ts_doctor_diagnose(directory, deep?)  → agent-tuned report + score
 *   - ts_doctor_explain(rule)               → offline rule explanation
 *   - ts_doctor_list_rules()                → the rule catalog
 *
 * All analysis logic lives in `./tools.ts` (SDK-free, unit-tested); this module
 * is the thin protocol adapter. Run: `ts-doctor-mcp` (stdio).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { diagnoseTool, explainTool, listRulesTool } from "./tools.js";

const server = new McpServer({ name: "ts-doctor", version: "0.0.0" });

server.tool(
  "ts_doctor_diagnose",
  "Lint and score a TypeScript project. Returns a deterministic 0–100 health score and a rule-deduplicated, tier-sorted report of findings (SYN/TYP/CFG/GRAPH).",
  {
    directory: z.string().describe("Path to the TypeScript project root to scan."),
    deep: z
      .boolean()
      .optional()
      .describe("Force (true) or skip (false) the type-aware pass. Default: auto."),
  },
  async ({ directory, deep }) => {
    const { summary, report } = await diagnoseTool({
      directory,
      ...(deep !== undefined ? { deep } : {}),
    });
    return {
      content: [
        { type: "text" as const, text: `${summary}\n\n${JSON.stringify(report, null, 2)}` },
      ],
    };
  },
);

server.tool(
  "ts_doctor_explain",
  "Explain a ts-doctor rule by id (offline, deterministic): its category, tier, severity, recommendation, and fix kind.",
  { rule: z.string().describe("The rule id, e.g. 'no-floating-promises'.") },
  ({ rule }) => ({
    content: [{ type: "text" as const, text: explainTool({ rule }) }],
  }),
);

server.tool(
  "ts_doctor_list_rules",
  "List the full ts-doctor rule catalog (id, category, tier, severity) for rule discovery.",
  {},
  () => ({
    content: [{ type: "text" as const, text: JSON.stringify(listRulesTool(), null, 2) }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);

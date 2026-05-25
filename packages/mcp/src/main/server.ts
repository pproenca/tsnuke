#!/usr/bin/env node
/**
 * tsnuke MCP server (stdio) — exposes the linter to coding agents.
 *
 * Tools:
 *   - tsnuke_diagnose(directory, deep?)  → agent-tuned report + score
 *   - tsnuke_explain(rule)               → offline rule explanation
 *   - tsnuke_list_rules()                → the rule catalog
 *
 * All analysis logic lives in `./tools.ts` (SDK-free, unit-tested); this module
 * is the thin protocol adapter. Run: `tsnuke-mcp` (stdio).
 *
 * ── Effect-TS slice port (RULE-029 deviation) ─────────────────────────────────
 * Legacy registered each tool with `server.tool(name, desc, ZOD_SHAPE, handler)`,
 * letting the SDK validate args against a **zod** raw shape. This slice removes zod
 * entirely: the AUTHORITATIVE validation is `effect/Schema`. We construct the
 * `McpServer` (as the brief requires) and register the two protocol request handlers
 * (`tools/list`, `tools/call`) on its underlying low-level `server`, so the raw
 * incoming `arguments` flow through our `Schema.decodeUnknownEither` gate (`./schemas.ts`)
 * — no zod shape is ever handed to the SDK. The `tools/list` response advertises a JSON
 * Schema DERIVED from the same `effect/Schema` (`JSONSchema.make`) for discovery. On a
 * decode `Left` we return an MCP `InvalidParams` error (the zod-gate equivalent). The
 * `content` (text) shape returned on success is byte-identical to legacy.
 */
import { Either, ParseResult } from "effect";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import {
  decodeDiagnoseArgs,
  decodeExplainArgs,
  decodeListRulesArgs,
  DiagnoseJsonSchema,
  ExplainJsonSchema,
  ListRulesJsonSchema,
} from "./schemas.js";
import { diagnoseTool, explainTool, listRulesTool } from "./tools.js";

/** Tool descriptions — preserved VERBATIM from legacy `server.ts`. */
const DIAGNOSE_DESCRIPTION =
  "Lint and score a TypeScript project. Returns a deterministic 0–100 health score and a rule-deduplicated, tier-sorted report of findings (SYN/TYP/CFG/GRAPH).";
const EXPLAIN_DESCRIPTION =
  "Explain a tsnuke rule by id (offline, deterministic): its category, tier, severity, recommendation, and fix kind.";
const LIST_RULES_DESCRIPTION =
  "List the full tsnuke rule catalog (id, category, tier, severity) for rule discovery.";

/** The `tools/list` payload — JSON Schemas derived from the `effect/Schema` args. */
const TOOL_DEFINITIONS = [
  {
    name: "tsnuke_diagnose",
    description: DIAGNOSE_DESCRIPTION,
    inputSchema: DiagnoseJsonSchema,
  },
  {
    name: "tsnuke_explain",
    description: EXPLAIN_DESCRIPTION,
    inputSchema: ExplainJsonSchema,
  },
  {
    name: "tsnuke_list_rules",
    description: LIST_RULES_DESCRIPTION,
    inputSchema: ListRulesJsonSchema,
  },
] as const;

/**
 * Build the configured {@link McpServer} (without connecting a transport). The
 * `tools/list` + `tools/call` handlers are registered on the underlying low-level
 * `server` so the raw `arguments` pass through the `effect/Schema` gate. Exposed for
 * tests + reuse; `main()` connects it to stdio.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "tsnuke", version: "0.0.0" });

  // Declare the `tools` capability. The SDK's `McpServer.tool()` would do this implicitly,
  // but we register the raw `tools/list` + `tools/call` protocol handlers ourselves (so the
  // effect/Schema gate — not a zod shape — is authoritative), so we declare it explicitly.
  server.server.registerCapabilities({ tools: {} });

  // tools/list — advertise the three tools with their derived JSON Schemas.
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOL_DEFINITIONS.map((t) => ({ ...t })),
  }));

  // tools/call — the AUTHORITATIVE effect/Schema validation gate (RULE-029), then
  // dispatch to the pure handler and return the legacy `content` (text) shape.
  server.server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<CallToolResult> => {
      const { name, arguments: rawArgs } = request.params;
      const args = rawArgs ?? {};

      switch (name) {
        case "tsnuke_diagnose": {
          const decoded = decodeDiagnoseArgs(args);
          if (Either.isLeft(decoded)) throw invalidParams(name, decoded.left);
          const { directory, deep } = decoded.right;
          // exactOptionalPropertyTypes: only set `deep` when present (legacy did the same).
          const { summary, report } = await diagnoseTool({
            directory,
            ...(deep !== undefined ? { deep } : {}),
          });
          return {
            content: [
              { type: "text", text: `${summary}\n\n${JSON.stringify(report, null, 2)}` },
            ],
          };
        }
        case "tsnuke_explain": {
          const decoded = decodeExplainArgs(args);
          if (Either.isLeft(decoded)) throw invalidParams(name, decoded.left);
          return {
            content: [{ type: "text", text: explainTool(decoded.right) }],
          };
        }
        case "tsnuke_list_rules": {
          const decoded = decodeListRulesArgs(args);
          if (Either.isLeft(decoded)) throw invalidParams(name, decoded.left);
          return {
            content: [{ type: "text", text: JSON.stringify(listRulesTool(), null, 2) }],
          };
        }
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    },
  );

  return server;
}

/** Render a `Schema` decode failure as an MCP `InvalidParams` error (zod-gate equivalent). */
function invalidParams(tool: string, error: ParseResult.ParseError): McpError {
  return new McpError(
    ErrorCode.InvalidParams,
    `Invalid arguments for tool ${tool}: ${ParseResult.TreeFormatter.formatErrorSync(error)}`,
  );
}

/** Connect the server to stdio. The runnable entry point (`tsnuke-mcp`). */
export async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run only when executed directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

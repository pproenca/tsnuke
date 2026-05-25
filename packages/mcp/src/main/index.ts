/**
 * `@ts-doctor/mcp-effect` — public surface of the ts-doctor MCP server slice.
 *
 * The MCP (Model Context Protocol) server exposes the linter to coding agents (the
 * primary consumer, per the AI-native design) over three tools:
 *   - `ts_doctor_diagnose(directory, deep?)` → agent-tuned report + score
 *   - `ts_doctor_explain(rule)`              → offline rule explanation
 *   - `ts_doctor_list_rules()`               → the rule catalog
 *
 * Two layers, faithfully ported from legacy `packages/mcp`:
 *   - `tools.ts` — the PURE, SDK-free handlers, rewired onto the modern engine/format/
 *     registry slices (`diagnoseNode` / `formatAgentReport` / `explain` / the registry).
 *   - `server.ts` — the thin stdio protocol adapter. Tool-argument validation is the ONE
 *     deviation: zod → `effect/Schema` (RULE-029, `schemas.ts`), the authoritative gate.
 *
 * See TRANSFORMATION_NOTES.md for the legacy → target mapping and the deviation.
 */

// ---- Pure handlers (SDK-free, unit-tested) ----
export {
  diagnoseTool,
  explainTool,
  listRulesTool,
  type DiagnoseToolArgs,
  type DiagnoseToolResult,
  type ExplainToolArgs,
  type RuleCatalogEntry,
} from "./tools.js";

// ---- RULE-029 arg validation (effect/Schema — the zod replacement) ----
export {
  DiagnoseArgs,
  ExplainArgs,
  ListRulesArgs,
  decodeDiagnoseArgs,
  decodeExplainArgs,
  decodeListRulesArgs,
  DiagnoseJsonSchema,
  ExplainJsonSchema,
  ListRulesJsonSchema,
} from "./schemas.js";

// ---- SDK wiring (stdio McpServer) ----
export { createServer, main } from "./server.js";

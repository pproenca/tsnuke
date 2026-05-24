/**
 * `@ts-doctor/mcp` — the MCP server's programmatic surface (the pure tool
 * handlers). The runnable stdio server is `./server.ts` (the package `bin`).
 */
export { diagnoseTool, explainTool, listRulesTool } from "./tools.js";
export type {
  DiagnoseToolArgs,
  DiagnoseToolResult,
  ExplainToolArgs,
  RuleCatalogEntry,
} from "./tools.js";

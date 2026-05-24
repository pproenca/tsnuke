/**
 * `--explain` / `--why` (offline). The implementation now lives in
 * `@ts-doctor/core` (shared by the CLI and the MCP server); this re-export keeps
 * the CLI's import paths stable.
 */
export { explain, explainDiagnostic, asRuleLookup } from "@ts-doctor/core";
export type { RuleLookup, ExplainContext } from "@ts-doctor/core";

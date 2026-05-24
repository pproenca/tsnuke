/**
 * Agent-tuned output (C14). The implementation now lives in `@ts-doctor/core`
 * (a domain projection shared by the CLI and the MCP server); this re-export
 * keeps the CLI's import paths stable.
 */
export { formatAgentReport } from "@ts-doctor/core";
export type {
  AgentReport,
  AgentRuleEntry,
  AgentOccurrence,
  AgentCategoryGroup,
} from "@ts-doctor/core";

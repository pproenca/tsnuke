import type { Diagnostic } from "@ts-doctor/contracts-effect";

/**
 * Deterministic diagnostic identity (BC-13).
 *
 * Format: `filePath::line:column::plugin/rule`.
 *
 * Stable across non-mutating re-scans — the contract an agent references to
 * track a finding between runs. Note: `--fix` shifts line:column and therefore
 * invalidates positional identities *by design* (see REIMAGINED_ARCHITECTURE.md §7).
 *
 * Faithful port of legacy `packages/ts-doctor-rules/src/identity.ts`. `Diagnostic`
 * is imported from `@ts-doctor/contracts-effect` (not vendored).
 */
export function diagnosticIdentity(d: Diagnostic): string {
  return `${d.filePath}::${d.line}:${d.column}::${d.plugin}/${d.rule}`;
}

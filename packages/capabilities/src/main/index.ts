/**
 * `@ts-doctor/capabilities-effect` — public surface of the Effect-TS rule-activation
 * predicate slice.
 *
 * Implements RULE-019 (universal rule-activation predicate) and RULE-020 (inverted
 * CFG gating). See TRANSFORMATION_NOTES.md for the legacy → target mapping; this
 * slice has ZERO intentional behavioral deviations (a 0-divergence equivalence proof).
 *
 * The vendored contract (`RuleMeta`/`Severity`/`Capability`, modeled as `effect/Schema`)
 * is the activation-relevant subset only; ownership migrates to the future
 * `@ts-doctor/rules` Effect slice (TRANSFORMATION_NOTES Follow-up #1). `Tier` is
 * defined in RuleMeta.ts for a faithful contract but is NOT re-exported here — the
 * predicate doesn't gate on it, and publishing a symbol pre-committed to de-vendoring
 * would create a breaking removal later (barrel hygiene).
 */

export {
  Capability,
  RuleMeta,
  Severity,
  decodeRuleMeta,
} from "./RuleMeta.js";

export { resolveSeverity, shouldActivate } from "./Capabilities.js";

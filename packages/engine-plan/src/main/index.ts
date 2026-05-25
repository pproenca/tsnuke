/**
 * `@ts-fix/engine-plan-effect` — public surface of the Effect-TS two-tier
 * engine-planner slice (RULE-018, the partial-honesty contract, P0).
 *
 * This is a TRUE strangler-fig: the slice CONSUMES the already-completed
 * `@ts-fix/capabilities-effect` slice for `shouldActivate` / `resolveSeverity`
 * (RULE-019/020) and the `RuleMeta`/`Severity`/`Capability` contract — it does NOT
 * re-vendor them. See TRANSFORMATION_NOTES.md for the legacy → target mapping; this
 * slice has ZERO intentional behavioral deviations (a 0-divergence equivalence proof).
 *
 * `planEngineRun` is a plain synchronous pure function (Brief 25/91); the activation
 * predicate is INJECTED ({@link ActivatePredicate}) so the planner is testable in
 * isolation, while production wires the consumed `shouldActivate`.
 */

export {
  SKIP_REASON_NO_TYPECHECK,
  SKIP_REASON_NO_DEEP,
  planEngineRun,
  type Tier,
  type PlannedRule,
  type EnginePlan,
  type SeverityOverrides,
  type ActivatePredicate,
} from "./EnginePlan.js";

// Re-export the consumed activation contract so downstream callers (the engine
// slice) get the planner's vocabulary from one barrel. These types are OWNED by
// `@ts-fix/capabilities-effect`; we re-export, never re-declare (no conflicting
// copy). `shouldActivate` / `resolveSeverity` are deliberately NOT re-exported —
// import them from `@ts-fix/capabilities-effect` directly to keep this barrel's
// surface the planner's own.
export type {
  RuleMeta,
  Severity,
  Capability,
} from "@ts-fix/capabilities-effect";

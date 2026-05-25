/**
 * The PURE two-tier engine planner — the partial-honesty decision, isolated
 * (RULE-018, P0; legacy `packages/core/src/engine-plan.ts`). **The single most
 * behavior-defining rule in the system.**
 *
 * `planEngineRun` decides which rules run in which tier and what gets skipped. It is
 * deliberately FREE of any runtime import that would build a `ts.Program`; it only
 * plans. The activation predicate is INJECTED ({@link ActivatePredicate}) so the
 * planner is unit-testable in isolation — production wires the REAL `shouldActivate`
 * consumed from `@ts-doctor/capabilities-effect` (RULE-019/020).
 *
 * Per the Modernization Brief (lines 25/91) this stays a **plain synchronous pure
 * function — NOT `Effect`-wrapped**: it is pure CPU planning over in-memory token
 * sets; wrapping it in a fiber buys nothing. The Effect ecosystem appears only in
 * the consumed contract layer ({@link RuleMeta}/{@link Severity}/{@link Capability},
 * modeled as `effect/Schema` in the capabilities slice and IMPORTED here, not
 * re-vendored).
 *
 * THE PARTIAL-HONESTY CONTRACT (preserve EXACTLY, RULE-018):
 *   - Tier-1 tiers = {SYN, CFG, GRAPH} (always run); Tier-2 tier = TYP.
 *   - `typecheckOk = caps.has("typecheck:ok")`;
 *     `tier2Enabled = typecheckOk && deep !== false`.
 *   - For TYP rules, activation/skip-accounting evaluates against a SYNTHETIC
 *     `capsForTyp` (caps + injected `typecheck:ok` when absent) so a TYP rule that
 *     WOULD run is counted as skipped even when the token is absent — but the actual
 *     RUN stays gated on the real `tier2Enabled`. This synthetic detail is
 *     LOAD-BEARING; do not "simplify" it away.
 *   - A rule joins its tier only if `activate(...)` is true AND `resolveSeverity`
 *     ≠ null (`"off"` skips).
 *   - When `!tier2Enabled`: every ACTIVATED TYP rule → `skippedCheckReasons[id]` +
 *     `skippedChecks.push(id)`, reason = `SKIP_REASON_NO_TYPECHECK` when `!typecheckOk`
 *     else `SKIP_REASON_NO_DEEP`. `scorePartial = skippedChecks.length > 0`.
 *
 * The contract is "partial honesty": a partial run uses the *same* score scale as a
 * full run — only the `scorePartial` flag differs (RULE-018/041). See
 * TRANSFORMATION_NOTES.md.
 */

import { resolveSeverity } from "@ts-doctor/capabilities-effect";
import type {
  Capability,
  RuleMeta,
  Severity,
} from "@ts-doctor/capabilities-effect";

/**
 * Analysis tier. Derived from the consumed {@link RuleMeta} contract
 * (`RuleMeta["tier"]`) rather than re-vendored — the capabilities slice owns this
 * literal but does not re-export `Tier` from its barrel (barrel hygiene), and
 * re-declaring a parallel `Schema.Literal` here would risk a conflicting copy.
 */
export type Tier = RuleMeta["tier"];

/** Tiers that run in the always-available Tier-1 pass (RULE-018). */
const TIER1_TIERS: ReadonlySet<Tier> = new Set<Tier>(["SYN", "CFG", "GRAPH"]);
/** The type-aware tier, gated behind `typecheck:ok` (RULE-018). */
const TIER2_TIER: Tier = "TYP";

/**
 * Why a TYP check was skipped — carried into `skippedCheckReasons` (RULE-018).
 * FROZEN message string, preserved VERBATIM from legacy `engine-plan.ts:26-27`.
 */
export const SKIP_REASON_NO_TYPECHECK =
  "Tier-2 (type-aware) skipped: project does not type-check (typecheck:ok absent).";
/**
 * Why a TYP check was skipped under `--no-deep` (RULE-018). FROZEN message string,
 * preserved VERBATIM from legacy `engine-plan.ts:28-29`.
 */
export const SKIP_REASON_NO_DEEP =
  "Tier-2 (type-aware) skipped: --no-deep (type-aware pass disabled).";

/** A rule selected to run, paired with its resolved registration severity. */
export interface PlannedRule {
  readonly meta: RuleMeta;
  readonly severity: Severity;
}

/**
 * The pure outcome of deciding which rules run where (RULE-018). A plain readonly
 * record — NOT an `Effect` — since the planner is a pure synchronous function.
 */
export interface EnginePlan {
  /** Tier-1 rules that activated and will run. */
  readonly tier1: ReadonlyArray<PlannedRule>;
  /** Tier-2 (TYP) rules that activated and will run (empty unless gated open). */
  readonly tier2: ReadonlyArray<PlannedRule>;
  /** Whether the Tier-2 pass is open (`typecheck:ok` present AND `deep !== false`). */
  readonly tier2Enabled: boolean;
  /** TYP rule ids skipped → reason (RULE-018). Empty when Tier-2 ran. */
  readonly skippedCheckReasons: Record<string, string>;
  /** The list form of skipped checks (rule ids), in input order. */
  readonly skippedChecks: ReadonlyArray<string>;
  /** True when any Tier-2 rule was skipped — score is on a partial scale (RULE-018). */
  readonly scorePartial: boolean;
}

/**
 * Per-rule explicit severity overrides resolved from config, keyed by rule id. A
 * `ReadonlyMap` (mirrors legacy) — `"off"` turns a rule off; any other value bumps
 * its registration severity.
 */
export type SeverityOverrides = ReadonlyMap<string, Severity | "off">;

/**
 * The activation predicate shape. Structurally matches
 * `@ts-doctor/capabilities-effect#shouldActivate` (RULE-019); injected so the
 * planner is testable with a trivial predicate and free of a runtime dependency on
 * the predicate's internals.
 */
export type ActivatePredicate = (
  rule: RuleMeta,
  caps: ReadonlySet<Capability>,
  ignoredTags: ReadonlySet<string>,
  explicit?: Severity | "off",
) => boolean;

/**
 * Decide which rules run in which tier, and what gets skipped (PURE, RULE-018).
 *
 * Tier-2 is open iff `typecheck:ok` ∈ caps AND `deep !== false`. When closed, every
 * ACTIVATED TYP rule is recorded as skipped (with a reason) and `scorePartial` is
 * set true — the partial-honesty contract. Activation/severity are delegated to the
 * injected `activate` predicate and the consumed `resolveSeverity` so this slice
 * stays free of a re-vendored predicate copy.
 *
 * @param rules        all candidate rule metadata (from the registry)
 * @param caps         the project's capability token set
 * @param ignoredTags  tags the config asked to ignore
 * @param overrides    per-rule severity overrides from config (id → sev | "off")
 * @param deep         tri-state: true forces, false skips, undefined = auto
 * @param activate     the activation predicate (the real `shouldActivate` in prod)
 */
export function planEngineRun(
  rules: readonly RuleMeta[],
  caps: ReadonlySet<Capability>,
  ignoredTags: ReadonlySet<string>,
  overrides: SeverityOverrides,
  deep: boolean | undefined,
  activate: ActivatePredicate,
): EnginePlan {
  const tier1: PlannedRule[] = [];
  const tier2: PlannedRule[] = [];
  const activatedTyp: RuleMeta[] = [];

  const typecheckOk = caps.has("typecheck:ok");
  const tier2Enabled = typecheckOk && deep !== false;

  // TYP rules declare `requires:["typecheck:ok"]`. For skip ACCOUNTING (RULE-018) we
  // must know which TYP rules WOULD run if the type-aware tier were open — so we
  // evaluate their eligibility against caps with `typecheck:ok` treated as
  // satisfiable. Otherwise an absent token would filter them out and they could
  // never be reported as "skipped". The actual RUN stays gated on `tier2Enabled`.
  // LOAD-BEARING — see the module doc and TRANSFORMATION_NOTES.md.
  const capsForTyp: ReadonlySet<Capability> = typecheckOk
    ? caps
    : new Set<Capability>([...caps, "typecheck:ok"]);

  for (const meta of rules) {
    const explicit = overrides.get(meta.id);

    if (meta.tier === TIER2_TIER) {
      if (!activate(meta, capsForTyp, ignoredTags, explicit)) continue;
      const severity = resolveSeverity(meta, explicit);
      if (severity === null) continue; // turned off
      activatedTyp.push(meta);
      if (tier2Enabled) tier2.push({ meta, severity });
    } else if (TIER1_TIERS.has(meta.tier)) {
      if (!activate(meta, caps, ignoredTags, explicit)) continue;
      const severity = resolveSeverity(meta, explicit);
      if (severity === null) continue; // turned off
      tier1.push({ meta, severity });
    }
  }

  const skippedCheckReasons: Record<string, string> = {};
  const skippedChecks: string[] = [];
  if (!tier2Enabled) {
    const reason = !typecheckOk ? SKIP_REASON_NO_TYPECHECK : SKIP_REASON_NO_DEEP;
    for (const meta of activatedTyp) {
      skippedCheckReasons[meta.id] = reason;
      skippedChecks.push(meta.id);
    }
  }

  return {
    tier1,
    tier2,
    tier2Enabled,
    skippedCheckReasons,
    skippedChecks,
    scorePartial: skippedChecks.length > 0,
  };
}

/**
 * PURE engine planning (BC-03) — the partial-honesty decision, isolated.
 *
 * This module decides which rules run in which tier and what gets skipped. It is
 * deliberately FREE of any runtime import from `@ts-doctor/rules` (types only),
 * so the BC-03 partial-honesty path is unit-testable WITHOUT the sibling package
 * built. The activation predicate is INJECTED (`activate`) — `engine.ts` passes
 * the real `shouldActivate`; tests pass a trivial predicate or the real one.
 *
 * See REIMAGINED_ARCHITECTURE.md §4.1 (BC-03).
 */

import type {
  Capability,
  RuleMeta,
  Severity,
  Tier,
} from "@ts-doctor/rules";

/** Tiers that run in the always-available Tier-1 pass. */
const TIER1_TIERS: ReadonlySet<Tier> = new Set<Tier>(["SYN", "CFG", "GRAPH"]);
/** The type-aware tier, gated behind `typecheck:ok`. */
const TIER2_TIER: Tier = "TYP";

/** Why a TYP check was skipped (carried into `skippedCheckReasons`, BC-03). */
export const SKIP_REASON_NO_TYPECHECK =
  "Tier-2 (type-aware) skipped: project does not type-check (typecheck:ok absent).";
export const SKIP_REASON_NO_DEEP =
  "Tier-2 (type-aware) skipped: --no-deep (type-aware pass disabled).";

/** The pure outcome of deciding which rules run where (BC-03). */
export interface EnginePlan {
  /** Tier-1 rules that activated and will run. */
  tier1: { meta: RuleMeta; severity: Severity }[];
  /** Tier-2 (TYP) rules that activated and will run (empty unless gated open). */
  tier2: { meta: RuleMeta; severity: Severity }[];
  /** Whether the Tier-2 pass is open (typecheck:ok present AND deep !== false). */
  tier2Enabled: boolean;
  /** TYP rule ids skipped → reason (BC-03). Empty when Tier-2 ran. */
  skippedCheckReasons: Record<string, string>;
  /** The list form of skipped checks (rule ids). */
  skippedChecks: string[];
  /** True when any Tier-2 rule was skipped — score is on a partial scale (BC-03). */
  scorePartial: boolean;
}

/** Per-rule explicit severity overrides resolved from config, keyed by rule id. */
export type SeverityOverrides = ReadonlyMap<string, Severity | "off">;

/** The activation predicate shape (matches `@ts-doctor/rules#shouldActivate`). */
export type ActivatePredicate = (
  rule: RuleMeta,
  caps: ReadonlySet<Capability>,
  ignoredTags: ReadonlySet<string>,
  explicit?: Severity | "off",
) => boolean;

/** Resolve the severity a rule registers at: explicit override (not "off") else default. */
function resolveSeverity(
  meta: RuleMeta,
  explicit: Severity | "off" | undefined,
): Severity | null {
  if (explicit === "off") return null;
  return explicit ?? meta.severity;
}

/**
 * Decide which rules run in which tier, and what gets skipped (PURE, BC-03).
 *
 * Tier-2 is open iff `typecheck:ok` ∈ caps AND `deep !== false`. When closed,
 * every ACTIVATED TYP rule is recorded as skipped (with a reason) and
 * `scorePartial` is set true. Activation is delegated to the injected `activate`
 * predicate so this stays free of runtime sibling imports.
 *
 * @param rules        all candidate rule metadata (from the registry)
 * @param caps         the project's capability token set
 * @param ignoredTags  tags the config asked to ignore
 * @param overrides    per-rule severity overrides from config (id → sev | "off")
 * @param deep         tri-state: true forces, false skips, undefined = auto
 * @param activate     the activation predicate (real `shouldActivate` in prod)
 */
export function planEngineRun(
  rules: readonly RuleMeta[],
  caps: ReadonlySet<Capability>,
  ignoredTags: ReadonlySet<string>,
  overrides: SeverityOverrides,
  deep: boolean | undefined,
  activate: ActivatePredicate,
): EnginePlan {
  const tier1: { meta: RuleMeta; severity: Severity }[] = [];
  const tier2: { meta: RuleMeta; severity: Severity }[] = [];
  const activatedTyp: RuleMeta[] = [];

  const typecheckOk = caps.has("typecheck:ok");
  const tier2Enabled = typecheckOk && deep !== false;

  // TYP rules declare `requires:["typecheck:ok"]`. For skip ACCOUNTING (BC-03) we
  // must know which TYP rules WOULD run if the type-aware tier were open — so we
  // evaluate their eligibility against caps with `typecheck:ok` treated as
  // satisfiable. Otherwise an absent token would filter them out and they could
  // never be reported as "skipped". The actual RUN stays gated on `tier2Enabled`.
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

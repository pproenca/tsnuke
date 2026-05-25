/**
 * The capability-gated rule-activation predicate — the pure core (RULE-019, RULE-020).
 *
 * Decides, per rule, whether it runs against a project. Computed in-process from
 * declarative token sets: no network, no clock, no randomness. Same inputs →
 * identical decision. This predicate gates which rules run → which diagnostics exist
 * → the score, so it is load-bearing (see TRANSFORMATION_NOTES.md Follow-up).
 *
 * Per the Modernization Brief (lines 25/91) these stay **plain synchronous pure
 * functions** — NOT `Effect`-wrapped. The Effect ecosystem appears only in the
 * contract layer ({@link ./RuleMeta.ts}: `RuleMeta`/`Severity`/`Capability` as
 * `effect/Schema`). A clean boolean predicate is the goal; no `Match`/pipeline is
 * forced where a guarded conditional is clearer.
 *
 * SHORT-CIRCUIT ORDER IS LOAD-BEARING (RULE-019). The five gates are evaluated in a
 * FIXED order, each able to short-circuit to `false`. The order is preserved exactly
 * from legacy (`packages/ts-fix-rules/src/capabilities.ts:23-57`):
 *   1. `explicit === "off"`                              → false (off wins outright)
 *   2. every `requires` token ∈ `caps`, else            → false (AND-gate)
 *   3. any `disabledBy` token ∈ `caps`                   → false (inverted gating, RULE-020)
 *   4. any `rule.tags` ∈ `ignoredTags`                   → false
 *   5. `defaultEnabled === false && explicit === undefined` → false (opt-in)
 *   6. else                                              → true.
 */

import type { Capability, RuleMeta, Severity } from "./RuleMeta.js";

/**
 * Whether a rule activates against a project (RULE-019). Pure over token sets.
 *
 * The INVERTED pattern (RULE-020): a CFG "enable-X" rule declares
 * `requires:["tsconfig"]` + `disabledBy:["X"]`. The `X` token is present only when
 * the flag is already ON, so the rule fires *only when the flag is OFF* (token
 * absent) — it self-disables once the goal is met. Critical: a missing flag must
 * default to "off" (token absent), never "on", or this inverts.
 *
 * Gates short-circuit in the FIXED order documented on this module — e.g. an
 * explicit `"off"` beats a satisfied `requires`, and a present `disabledBy` beats a
 * satisfied `requires`.
 *
 * @param rule        the rule's metadata (activation-relevant subset)
 * @param caps        the project's capability token set
 * @param ignoredTags tags the config asked to ignore
 * @param explicit    a per-rule severity override, or `"off"`, from config
 */
export function shouldActivate(
  rule: RuleMeta,
  caps: ReadonlySet<Capability>,
  ignoredTags: ReadonlySet<string>,
  explicit?: Severity | "off",
): boolean {
  // 1. explicit off wins outright.
  if (explicit === "off") return false;

  // 2. requires: ALL must be present (AND-gate).
  if (rule.requires) {
    for (const cap of rule.requires) {
      if (!caps.has(cap)) return false;
    }
  }

  // 3. disabledBy: ANY present disables (the inverted-gating mechanism, RULE-020).
  if (rule.disabledBy) {
    for (const cap of rule.disabledBy) {
      if (caps.has(cap)) return false;
    }
  }

  // 4. ignored tags: ANY overlap disables.
  if (rule.tags) {
    for (const tag of rule.tags) {
      if (ignoredTags.has(tag)) return false;
    }
  }

  // 5. opt-in rules need an explicit severity to turn on.
  //    KNOWN DEAD BRANCH (preserved): no rule in the catalog currently sets
  //    `defaultEnabled: false`, so this gate is unreachable in practice — but the
  //    contract requires it, so it stays. See TRANSFORMATION_NOTES.md (D-dead).
  if (rule.defaultEnabled === false && explicit === undefined) return false;

  return true;
}

/**
 * Resolve the severity a rule registers at (RULE-019): the explicit override if
 * present (and not `"off"`), otherwise the rule's own default. Returns `null` when
 * the rule is turned off (`explicit === "off"`), so callers can skip it.
 *
 * Plain synchronous function — `null` (not `Option`) is kept deliberately to mirror
 * the legacy `Severity | null` return exactly; this is the equivalence target, and
 * the call site (the engine slice) will own any `Option` bridging.
 */
export function resolveSeverity(
  rule: RuleMeta,
  explicit?: Severity | "off",
): Severity | null {
  if (explicit === "off") return null;
  return explicit ?? rule.severity;
}

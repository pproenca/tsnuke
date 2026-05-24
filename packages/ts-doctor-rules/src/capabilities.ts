import type { Capability, RuleMeta, Severity } from "./types.js";

/**
 * The capability-gated activation predicate (BC-08, BC-09). Pure over token sets.
 *
 * A rule activates iff ALL of the following hold:
 *   1. every `requires` token ∈ `caps`            (AND-gate)
 *   2. no `disabledBy` token ∈ `caps`             (ANY-gate — inverted gating, BC-09)
 *   3. no `tag` ∈ `ignoredTags`
 *   4. it is not `defaultEnabled:false` without an explicit severity
 *   5. the explicit override is not `"off"`
 *
 * The INVERTED pattern (BC-09): a CFG "enable-X" rule declares
 * `requires:["tsconfig"]` + `disabledBy:["X"]`. The `X` token is present only
 * when the flag is already ON, so the rule fires *only when the flag is OFF*
 * (token absent) — it self-disables once the goal is met.
 *
 * @param rule        the rule's metadata
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
  // 5. explicit off wins outright.
  if (explicit === "off") return false;

  // 1. requires: ALL must be present.
  if (rule.requires) {
    for (const cap of rule.requires) {
      if (!caps.has(cap)) return false;
    }
  }

  // 2. disabledBy: ANY present disables (this is the inverted-gating mechanism).
  if (rule.disabledBy) {
    for (const cap of rule.disabledBy) {
      if (caps.has(cap)) return false;
    }
  }

  // 3. ignored tags: ANY overlap disables.
  if (rule.tags) {
    for (const tag of rule.tags) {
      if (ignoredTags.has(tag)) return false;
    }
  }

  // 4. opt-in rules need an explicit severity to turn on.
  if (rule.defaultEnabled === false && explicit === undefined) return false;

  return true;
}

/**
 * Resolve the severity a rule registers at: the explicit override if present
 * (and not `"off"`), otherwise the rule's own default. Mirrors BC-08's
 * "register at `override ?? rule.severity`". Returns `null` when the rule is
 * turned off, so callers can skip it.
 */
export function resolveSeverity(
  rule: RuleMeta,
  explicit?: Severity | "off",
): Severity | null {
  if (explicit === "off") return null;
  return explicit ?? rule.severity;
}

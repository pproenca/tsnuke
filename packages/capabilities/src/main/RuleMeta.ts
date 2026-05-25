/**
 * The activation contract for the rule-activation predicate (RULE-019).
 *
 * DE-VENDORED: the `Severity` / `Capability` / `Tier` / `RuleMeta` Schemas that this
 * slice used to vendor (the activation-relevant subset) now live canonically in
 * `@tsnuke/contracts-effect` and are re-exported from here. The canonical `RuleMeta`
 * is the FULL legacy contract — a proven structural SUPERSET of the activation subset
 * this slice gated on, so `shouldActivate` / `resolveSeverity` (which read only
 * `requires` / `disabledBy` / `tags` / `defaultEnabled` / `severity`) are unaffected.
 *
 * This module re-exports the contracts symbols so the public barrel and the predicate
 * call sites keep their imports (`./RuleMeta.js`) unchanged. The predicate functions
 * stay plain & pure; they do NOT decode on the hot path.
 */

export {
  Capability,
  RuleMeta,
  Severity,
  Tier,
  decodeRuleMeta,
} from "@tsnuke/contracts-effect";

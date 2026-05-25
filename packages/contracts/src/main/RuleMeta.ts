/**
 * The CANONICAL rule-metadata contract, as `effect/Schema` (Modernization Brief
 * line 94). This is the FULL legacy `RuleMeta` (`packages/tsnuke-rules/src/types.ts:98-123`)
 * plus the `Capability` token — consolidating the SUBSET that the `capabilities` slice
 * vendors today (the activation-relevant fields only). The canonical version is a
 * structural SUPERSET of the capabilities subset, proven in `src/test/RuleMeta.compat.test.ts`,
 * so de-vendoring that slice later is safe.
 *
 * `Severity` / `Tier` are re-exported from `Diagnostic.ts` (single source of truth);
 * this module re-declares NOTHING — the capabilities slice vendored its own copies of
 * `Severity`/`Tier`, but here they live in one place. PURE contract: no Effect monad.
 */

import { Schema } from "effect";
import { FixKind, Severity, Tier } from "./Diagnostic.js";

/**
 * A single capability token in the project's `Set<string>`. Examples: `"ts:5.8"`,
 * `"strict"`, `"lib"`, `"typecheck:ok"`, `"noUncheckedIndexedAccess"`. An opaque string
 * — modeled as a Schema so a token set can be decoded at a trust boundary, while
 * predicates treat it as a plain string member of a `ReadonlySet`.
 */
export const Capability = Schema.String.annotations({ identifier: "Capability" });
export type Capability = typeof Capability.Type;

/**
 * Rule metadata: the static, declarative half of a rule that drives capability-gated
 * activation + presets (RULE-019/020). The FULL legacy contract — the four gate fields
 * (`requires` / `disabledBy` / `tags` / `defaultEnabled`) the activation predicate reads,
 * plus `fixKind` / `message` / `recommendation` which the capabilities slice's vendored
 * subset deliberately omitted (it owns only what it gates on). Here we own the whole shape.
 *
 * `defaultEnabled` omitted ⇒ default-on; only `=== false` opts the rule out (RULE-019).
 */
export const RuleMeta = Schema.Struct({
  /** Stable public id, e.g. `"no-ts-ignore"`. Frozen contract (NFR forward-compat). */
  id: Schema.String.annotations({
    description: 'Stable public id, e.g. `"no-ts-ignore"`. Frozen contract (NFR forward-compat).',
  }),
  severity: Severity,
  /** Category name; the codegen registry derives this from the rule's directory. */
  category: Schema.String.annotations({
    description: "Category name; the codegen registry derives this from the rule's directory.",
  }),
  tier: Tier,
  /** ALL of these must be present in the capability set for the rule to activate (RULE-019). */
  requires: Schema.optional(
    Schema.Array(Capability).annotations({
      description:
        "ALL of these must be present in the capability set for the rule to activate (RULE-019).",
    }),
  ),
  /** ANY of these present in the capability set disables the rule (RULE-019, inverted gating RULE-020). */
  disabledBy: Schema.optional(
    Schema.Array(Capability).annotations({
      description:
        "ANY of these present in the capability set disables the rule (RULE-019, inverted gating RULE-020).",
    }),
  ),
  /** Tags an ignore list can target (RULE-019). */
  tags: Schema.optional(
    Schema.Array(Schema.String).annotations({
      description: "Tags an ignore list can target (RULE-019).",
    }),
  ),
  /** When `false`, the rule is opt-in: it activates only under an explicit severity override (RULE-019). */
  defaultEnabled: Schema.optional(
    Schema.Boolean.annotations({
      description:
        "When `false`, the rule is opt-in: it activates only under an explicit severity override (RULE-019).",
    }),
  ),
  fixKind: Schema.optional(FixKind),
  /**
   * Project-level finding message. CFG rules don't walk a file AST — when one activates,
   * core emits a single project-level diagnostic carrying this message (falling back to
   * `recommendation`). Per-file (SYN/TYP/GRAPH) rules set their message at `report()`
   * time and leave this undefined.
   */
  message: Schema.optional(
    Schema.String.annotations({
      description:
        "Project-level finding message. CFG rules don't walk a file AST — when one activates, core emits a single project-level diagnostic carrying this message (falling back to `recommendation`). Per-file (SYN/TYP/GRAPH) rules set their message at `report()` time and leave this undefined.",
    }),
  ),
  /** Static, offline `--explain` text rendered by the CLI (no model call). */
  recommendation: Schema.optional(
    Schema.String.annotations({
      description: "Static, offline `--explain` text rendered by the CLI (no model call).",
    }),
  ),
}).annotations({ identifier: "RuleMeta" });
export type RuleMeta = typeof RuleMeta.Type;

/**
 * Decode an untrusted value into a {@link RuleMeta}, returning `Either` (not throwing).
 * The trust-boundary gate for rule metadata coming from outside the type system. The
 * predicate functions (capabilities slice) do NOT call this on the hot path.
 */
export const decodeRuleMeta = Schema.decodeUnknownEither(RuleMeta);

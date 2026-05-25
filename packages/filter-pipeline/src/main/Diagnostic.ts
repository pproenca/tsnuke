/**
 * The diagnostic contract the filter pipeline operates on.
 *
 * DE-VENDORED: the `Severity` / `Tier` / `FixKind` / `TextEdit` / `Fix` / `Diagnostic`
 * Schemas this slice used to vendor now live canonically in
 * `@tsnuke/contracts-effect` and are re-exported from here (so call sites that import
 * from `./Diagnostic.js` are unchanged). The canonical `Diagnostic` is the PUBLIC shape
 * the pipeline emits — a proven structural superset of the deleted local copy
 * (field-identical, incl. `Schema.Int`), so behavior is unchanged.
 *
 * `DiagnosticWithTags` stays LOCAL: it is the engine-only INPUT carry (the `tags` field,
 * RULE-023 Stage 1), which contracts deliberately EXCLUDES from the public `Diagnostic`
 * (tags are stripped before emit). It is now an `interface` extending the canonical
 * `Diagnostic` rather than a sibling Schema — `runFilterPipeline` / the stages use it as
 * a TYPE only (they never decode it), so a type-only declaration is exact and sufficient.
 *
 * SINGLE CANONICAL SEVERITY VOCABULARY (deviation D1, RULE-040): the engine speaks
 * exactly `"error" | "warning"`. The config vocabulary lives ONLY in `Config.ts`
 * (`ConfigSeverity`) and is normalized in ONE place (`normalizeConfigSeverity`,
 * `stages.ts`); the rest of the slice — including this re-exported `Diagnostic` — uses
 * only the canonical {@link Severity}. (The Config family is OUT of scope for the
 * de-vendor pass; `Config.ts` remains slice-local.)
 */

// Re-export the canonical Diagnostic-family Schemas (value + type) from contracts.
export {
  Severity,
  Tier,
  FixKind,
  TextEdit,
  Fix,
  Diagnostic,
} from "@tsnuke/contracts-effect";

import type { Diagnostic } from "@tsnuke/contracts-effect";

/**
 * A diagnostic with the engine-only `tags` carry used by the auto-suppress stage
 * (RULE-023 Stage 1). `tags` come from the originating rule's meta; they are STRIPPED
 * before the public {@link Diagnostic} is emitted (RULE-023 edge case). This is the
 * INPUT shape `runFilterPipeline` accepts; the canonical {@link Diagnostic} is the
 * OUTPUT shape it emits.
 *
 * Kept LOCAL (contracts excludes it from the public `Diagnostic` by design). Modeled as
 * an `interface` extending the canonical `Diagnostic` — structurally identical to the
 * former `Schema.Struct({ ...Diagnostic.fields, tags: Schema.optional(...) }).Type`; the
 * pipeline only ever uses it as a type (it never decodes), so no Schema value is needed.
 */
export interface DiagnosticWithTags extends Diagnostic {
  /** Tags from the rule meta, used only by the auto-suppress stage (RULE-023 Stage 1). */
  readonly tags?: readonly string[];
}

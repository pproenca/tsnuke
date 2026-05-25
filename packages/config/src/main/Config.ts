/**
 * The user-config contract (`tsdoctor.config.json` / `package.json#tsDoctor`) as
 * `effect/Schema` (Modernization Brief line 94 — the wire/domain contract is a
 * Schema, not a hand-rolled type). This is the FULL legacy `TsDoctorConfig`
 * (`legacy/ts-doctor/packages/core/src/types.ts:151-164`), all six fields, modeled
 * so the next slices can de-vendor onto it (the filter-pipeline slice vendored a
 * 3-field subset — TRANSFORMATION_NOTES Follow-up #2).
 *
 * CONFIG SEVERITY VOCABULARY (RULE-040). A config FILE speaks `error`/`warn`/`off`
 * for `rules`/`categories`. The engine speaks `error`/`warning`. The `warn`↔`warning`
 * normalization is DELIBERATELY NOT performed here — legacy `sanitizeConfig`
 * (`load-config.ts:42-51`) keeps the config vocabulary VERBATIM on its output, and
 * normalizes downstream (`index.ts:170-175` / `filter-pipeline.ts:44-49`). Preserving
 * that means a `sanitizeConfig` round-trip is byte-identical to legacy. The single
 * canonical vocabulary RULE-040 asks for lives in the filter-pipeline slice's
 * `normalizeConfigSeverity` (its deviation D1), which is where the two-place trap is
 * collapsed end-to-end — see TRANSFORMATION_NOTES Follow-up #3.
 *
 * QUIRK preserved exactly (RULE-040): `failOn` uses the ENGINE vocabulary
 * `"error" | "warning" | "none"`, while `rules`/`categories` use the CONFIG
 * vocabulary `"error" | "warn" | "off"`. These two `"warn"` vs `"warning"` spellings
 * are an observable part of the contract and are NOT unified here.
 */

import { Schema } from "effect";

/**
 * The severity vocabulary a config FILE uses for `rules`/`categories` (RULE-040):
 * `"error"`/`"warn"`/`"off"`. Distinct on purpose from `failOn`'s vocabulary and
 * from the engine's canonical `Severity`. Kept verbatim by {@link sanitizeConfig};
 * normalized to the engine vocab downstream (filter-pipeline slice).
 */
export const ConfigSeverity = Schema.Literal("error", "warn", "off").annotations({
  identifier: "ConfigSeverity",
});
export type ConfigSeverity = typeof ConfigSeverity.Type;

/**
 * The vocabulary `failOn` uses (RULE-040 / RULE-030): `"error" | "warning" | "none"`.
 * NOTE the deliberate `"warning"` spelling (engine vocab) — contrast with
 * {@link ConfigSeverity}'s `"warn"`. This split is a known vocabulary trap; it is
 * preserved here for legacy parity, not reconciled (see Config.ts header + RULE-040).
 */
export const FailOn = Schema.Literal("error", "warning", "none").annotations({
  identifier: "ConfigFailOn",
});
export type FailOn = typeof FailOn.Type;

/**
 * A single ignore override entry: `files` is required (an entry lacking a valid
 * `files: string[]` is dropped-with-warning, RULE-024); `rules` is optional. Match
 * by `files`, then drop the named `rules` (or all diagnostics if `rules` is absent).
 */
export const IgnoreOverride = Schema.Struct({
  files: Schema.Array(Schema.String).annotations({
    description: "Glob patterns this override applies to (required; bad entries dropped).",
  }),
  rules: Schema.optional(
    Schema.Array(Schema.String).annotations({
      description: "Rules to drop for matching files; absent means drop all diagnostics.",
    }),
  ),
}).annotations({ identifier: "IgnoreOverride" });
export type IgnoreOverride = typeof IgnoreOverride.Type;

/**
 * The `ignore` section. `rules`/`files`/`tags` must each be `string[]` else dropped
 * (RULE-024); `overrides` is an array of {@link IgnoreOverride}. Note `tags` is part
 * of the config contract (the legacy full type) even though the filter pipeline does
 * not read it (auto-suppress uses a frozen tag set) — kept here for fidelity.
 */
export const IgnoreConfig = Schema.Struct({
  rules: Schema.optional(
    Schema.Array(Schema.String).annotations({ description: "Rule ids suppressed everywhere." }),
  ),
  files: Schema.optional(
    Schema.Array(Schema.String).annotations({ description: "Glob patterns suppressed everywhere." }),
  ),
  tags: Schema.optional(
    Schema.Array(Schema.String).annotations({
      description: "Tags in the config contract; not read by the filter pipeline (kept for fidelity).",
    }),
  ),
  overrides: Schema.optional(
    Schema.Array(IgnoreOverride).annotations({ description: "Per-file-set rule suppressions." }),
  ),
}).annotations({ identifier: "IgnoreConfig" });
export type IgnoreConfig = typeof IgnoreConfig.Type;

/**
 * User config (`tsdoctor.config.json` / `package.json#tsDoctor`), loaded leniently
 * (RULE-024). All fields optional — an empty `{}` is a valid, no-op config. Mirrors
 * legacy `TsDoctorConfig` (`types.ts:151-164`) field-for-field.
 *
 * `plugins` is RETAINED if it is a valid `string[]` so the engine can warn about it
 * (RULE-024) but is NEVER loaded/resolved/imported (RULE-039 — RCE-by-construction).
 */
export const TsDoctorConfig = Schema.Struct({
  ignore: Schema.optional(IgnoreConfig),
  failOn: Schema.optional(
    FailOn.annotations({ description: 'The `--fail-on` gate mode ("error" | "warning" | "none").' }),
  ),
  customRulesOnly: Schema.optional(
    Schema.Boolean.annotations({ description: "Run only user-supplied rules." }),
  ),
  /** v1: IGNORED and never loaded (RULE-039). Present only so it can be warned about. */
  plugins: Schema.optional(
    Schema.Array(Schema.String).annotations({
      description: "v1: retained for a warning but NEVER loaded/resolved (RULE-039).",
    }),
  ),
  rules: Schema.optional(
    Schema.Record({ key: Schema.String, value: ConfigSeverity }).annotations({
      description: "Per-rule severity overrides (config vocabulary).",
    }),
  ),
  categories: Schema.optional(
    Schema.Record({ key: Schema.String, value: ConfigSeverity }).annotations({
      description: "Per-category severity overrides (config vocabulary).",
    }),
  ),
}).annotations({ identifier: "TsDoctorConfig" });
export type TsDoctorConfig = typeof TsDoctorConfig.Type;

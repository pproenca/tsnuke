/**
 * The CANONICAL user-config contract (`tsdoctor.config.json` / `package.json#tsDoctor`)
 * as `effect/Schema` (Modernization Brief line 94). This is the FULL legacy
 * `TsDoctorConfig` (`legacy/ts-doctor/packages/core/src/types.ts:151-164`), all six
 * fields — consolidating the THREE divergent copies that exist today:
 *   - `config` slice:          the full shape (already canonical there; mirrored here).
 *   - `filter-pipeline` slice:  a 3-field SUBSET (`ignore`/`rules`/`categories`).
 *   - `security` slice:         the BARE `{ plugins?: readonly string[] }`.
 *
 * The canonical version is a structural SUPERSET of all three (and of legacy), proven
 * in `src/test/Config.compat.test.ts`, so filter-pipeline and security can de-vendor
 * onto it later. PURE contract: no Effect monad, no loading/sanitizing logic (that
 * stays in the config slice — RULE-024).
 *
 * VOCABULARY QUIRK preserved exactly (RULE-040): `failOn` uses the ENGINE vocabulary
 * `"error" | "warning" | "none"`, while `rules`/`categories` use the CONFIG-FILE
 * vocabulary `"error" | "warn" | "off"`. These two `"warn"` vs `"warning"` spellings
 * are an observable part of the contract and are NOT unified here. The `warn`↔`warning`
 * normalization belongs downstream (filter-pipeline's `normalizeConfigSeverity`); a
 * `sanitizeConfig` round-trip stays byte-identical to legacy by keeping the config
 * vocabulary verbatim.
 */

import { Schema } from "effect";

/**
 * The severity vocabulary a config FILE uses for `rules`/`categories` (RULE-040):
 * `"error"`/`"warn"`/`"off"`. `"off"` drops the diagnostic; `"warn"` normalizes to the
 * engine's canonical `"warning"` downstream, `"error"` to `"error"`. Distinct on
 * purpose from {@link FailOn}'s vocabulary and from the engine's canonical `Severity`
 * (`Diagnostic.ts`).
 */
export const ConfigSeverity = Schema.Literal("error", "warn", "off");
export type ConfigSeverity = typeof ConfigSeverity.Type;

/**
 * The vocabulary `failOn` uses (RULE-040 / RULE-030): `"error" | "warning" | "none"`.
 * NOTE the deliberate `"warning"` spelling (engine vocab) — contrast with
 * {@link ConfigSeverity}'s `"warn"`. This split is a known vocabulary trap; it is
 * preserved here for legacy parity, NOT reconciled (see module header + RULE-040).
 */
export const FailOn = Schema.Literal("error", "warning", "none");
export type FailOn = typeof FailOn.Type;

/**
 * A single ignore override entry: `files` is required (an entry lacking a valid
 * `files: string[]` is dropped-with-warning, RULE-024); `rules` is optional. Match by
 * `files`, then drop the named `rules` (or all diagnostics if `rules` is absent).
 */
export const IgnoreOverride = Schema.Struct({
  files: Schema.Array(Schema.String),
  rules: Schema.optional(Schema.Array(Schema.String)),
});
export type IgnoreOverride = typeof IgnoreOverride.Type;

/**
 * The `ignore` section (the FULL legacy shape). `rules`/`files`/`tags` must each be
 * `string[]` else dropped (RULE-024); `overrides` is an array of {@link IgnoreOverride}.
 * `tags` is part of the config contract even though the filter pipeline does not read it
 * (auto-suppress uses a frozen tag set) — kept here for fidelity. The filter-pipeline
 * slice's vendored copy omits `tags`; the canonical (full) one accepts both shapes.
 */
export const IgnoreConfig = Schema.Struct({
  rules: Schema.optional(Schema.Array(Schema.String)),
  files: Schema.optional(Schema.Array(Schema.String)),
  tags: Schema.optional(Schema.Array(Schema.String)),
  overrides: Schema.optional(Schema.Array(IgnoreOverride)),
});
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
  failOn: Schema.optional(FailOn),
  customRulesOnly: Schema.optional(Schema.Boolean),
  /** v1: IGNORED and never loaded (RULE-039). Present only so it can be warned about. */
  plugins: Schema.optional(Schema.Array(Schema.String)),
  rules: Schema.optional(Schema.Record({ key: Schema.String, value: ConfigSeverity })),
  categories: Schema.optional(
    Schema.Record({ key: Schema.String, value: ConfigSeverity }),
  ),
});
export type TsDoctorConfig = typeof TsDoctorConfig.Type;

/**
 * Decode an untrusted value into a {@link TsDoctorConfig}, returning `Either` (not
 * throwing). NOTE: this is a STRICT contract decode, NOT the lenient drop-not-throw
 * loader (RULE-024) — that lives in the config slice's `sanitizeConfig`. Use this only
 * for already-trusted/structured config at a hard boundary.
 */
export const decodeTsDoctorConfig = Schema.decodeUnknownEither(TsDoctorConfig);

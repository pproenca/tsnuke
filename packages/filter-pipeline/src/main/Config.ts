/**
 * Config contract for the filter pipeline — DE-VENDORED.
 *
 * This slice previously VENDORED a 3-field subset (`ignore`/`rules`/`categories`) of
 * legacy `TsDoctorConfig` plus `ConfigSeverity`/`IgnoreConfig`/`IgnoreOverride`. Those
 * are now consolidated in `@ts-doctor/contracts-effect` (the canonical `effect/Schema`
 * home), whose `TsDoctorConfig` is a proven structural SUPERSET of the old subset — so
 * every existing read (`config.rules` / `config.categories` / `config.ignore`) still
 * typechecks unchanged. Re-exported here to preserve the public surface and keep the
 * `./Config.js` import paths stable across the slice.
 *
 * CONFIG SEVERITY VOCABULARY (RULE-040): config files speak `error`/`warn`/`off`; the
 * engine speaks `error`/`warning`. {@link ConfigSeverity} is the ONLY place the config
 * vocabulary appears in this slice; it is normalized into the canonical `Severity`
 * (`Diagnostic.ts`) in exactly ONE place — `normalizeConfigSeverity` (`stages.ts`).
 * That normalization (deviation D1) is BEHAVIOR and stays local to this slice; only the
 * contract types are de-vendored here.
 */

export {
  ConfigSeverity,
  IgnoreOverride,
  IgnoreConfig,
  TsDoctorConfig,
} from "@ts-doctor/contracts-effect";

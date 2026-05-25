/**
 * `@ts-doctor/contracts-effect` — the canonical `effect/Schema` home for ts-doctor's
 * cross-cutting domain contracts.
 *
 * This package consolidates the domain contracts that several completed strangler-fig
 * slices currently VENDOR (duplicate): the `Diagnostic` family (×3+: score,
 * filter-pipeline, build-report), `Severity` (×5), `Tier`/`FixKind` (×3), `RuleMeta`/
 * `Capability` (capabilities), and the `TsDoctorConfig` family (×3: config full /
 * filter-pipeline 3-field subset / security bare `{plugins?}`). The architecture-critic
 * flagged this drift as the highest-value cross-cutting follow-up; each canonical Schema
 * here is a proven structural SUPERSET of every vendored copy (see `src/test/*.compat.test.ts`
 * and TRANSFORMATION_NOTES.md), so de-vendoring those slices is mechanical and safe.
 *
 * PURE contracts — `effect/Schema` only, NO Effect monad. No business logic, no loaders,
 * no predicates: those stay in the owning slices. This package is additive infrastructure;
 * it does NOT edit the existing slices. Its first NEW consumer is the upcoming engine
 * slice, which will import `Diagnostic`/`RuleMeta`/`Capability`/`TsDoctorConfig` from here
 * instead of vendoring. See TRANSFORMATION_NOTES.md §4 for the per-slice de-vendor plan.
 */

// --- Diagnostic family (consolidates score / filter-pipeline / build-report copies) ---
export {
  Severity,
  Tier,
  FixKind,
  TextEdit,
  Fix,
  Diagnostic,
  decodeDiagnostic,
} from "./Diagnostic.js";

// --- Rule metadata (consolidates the capabilities slice's vendored subset → full) ---
export { Capability, RuleMeta, decodeRuleMeta } from "./RuleMeta.js";

// --- Config family (consolidates config full / filter-pipeline subset / security bare) ---
export {
  ConfigSeverity,
  FailOn,
  IgnoreOverride,
  IgnoreConfig,
  TsDoctorConfig,
  decodeTsDoctorConfig,
} from "./Config.js";

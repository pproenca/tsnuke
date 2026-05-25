/**
 * `@ts-doctor/errors-effect` — public surface of the Effect-TS tagged-errors slice.
 *
 * Implements RULE-037 (tagged discovery error classes): five `effect/Data` tagged
 * errors plus the `isTsDoctorError` guard. See TRANSFORMATION_NOTES.md for the
 * legacy → target mapping and the (deliberate) plain-Error → Data.TaggedError and
 * shared-base → independent-tagged-errors deviations.
 *
 * Barrel hygiene: export only what consumers (the discovery/engine slice that
 * THROWS these, and build-report's `serializeError` that CONSUMES them) need. The
 * internal `TsDoctorErrorProps` shape stays unexported.
 */

export {
  TsDoctorError,
  ProjectNotFoundError,
  NoTypeScriptProjectError,
  TsconfigNotFoundError,
  AmbiguousProjectError,
  TS_DOCTOR_ERROR_TAGS,
  isTsDoctorError,
  type AnyTsDoctorError,
} from "./Errors.js";

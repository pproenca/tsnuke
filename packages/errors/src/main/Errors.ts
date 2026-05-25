/**
 * Tagged discovery error classes (RULE-037), on the Effect ecosystem.
 *
 * Legacy `errors.ts` DELIBERATELY moved away from Effect tagged errors to plain
 * `Error` subclasses carrying a `_tag` discriminant. The target stack here is
 * Effect, so this slice moves BACK to idiomatic `effect/Data` tagged errors
 * ({@link https://effect.website | Data.TaggedError}). `Data.TaggedError(tag)`:
 *   - extends the native `Error` (so `instanceof Error` holds — verified in tests);
 *   - sets `_tag` AND `name` to the tag literal (matching legacy's strings);
 *   - accepts a props object; a `cause` prop is forwarded to the `Error`
 *     constructor options, landing on the NATIVE `.cause` property.
 *
 * RULE-037 requires the resulting errors to propagate to the CLI (exit 1) or to
 * `build-report.serializeError` (`report.ok = false`), which does `instanceof
 * Error` and walks `.cause` root-last. Those exact consumer dependencies — same
 * `_tag`/`name`, `instanceof Error`, native `.cause`, and a guard that matches
 * all five tags — are characterized in `src/test/` and proven equivalent to a
 * vendored copy of the legacy classes in `equivalence.test.ts`.
 *
 * DEVIATION (deliberate): legacy had ONE shared base class and an `instanceof`
 * guard. Here each error is an INDEPENDENT `Data.TaggedError` — subclassing one
 * tagged base would freeze `name` to the base tag (Effect derives `name` from the
 * tag literal), violating the per-class `name` contract. The guard is therefore
 * contract-based (`_tag` membership of {@link TS_DOCTOR_ERROR_TAGS}), not
 * `instanceof`-based. See TRANSFORMATION_NOTES.md §2.
 */

import { Data } from "effect";

/** Props every ts-doctor error accepts: a human message and an optional cause. */
interface TsDoctorErrorProps {
  /** Human-readable failure message (RULE-037, consumed by `serializeError`). */
  readonly message: string;
  /**
   * Optional underlying cause. Forwarded to the native `Error` `.cause` so the
   * `serializeError` `.cause` walk (root-last) keeps working unchanged.
   */
  readonly cause?: unknown;
}

/**
 * Base discovery error — `_tag` / `name` === `"TsDoctorError"`.
 *
 * Constructed as `new TsDoctorError(message, { cause })` to keep the legacy
 * call-site signature identical for the discovery/engine slice that throws these.
 */
export class TsDoctorError extends Data.TaggedError("TsDoctorError")<TsDoctorErrorProps> {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(buildProps(message, options));
  }
}

/** No project root could be located at/under the given directory (RULE-037). */
export class ProjectNotFoundError extends Data.TaggedError(
  "ProjectNotFoundError",
)<TsDoctorErrorProps> {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(buildProps(message, options));
  }
}

/** The directory has no resolvable `typescript` / no `.ts` sources (BC-06, RULE-037). */
export class NoTypeScriptProjectError extends Data.TaggedError(
  "NoTypeScriptProjectError",
)<TsDoctorErrorProps> {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(buildProps(message, options));
  }
}

/** No `tsconfig.json` was found (BC-06, RULE-037). */
export class TsconfigNotFoundError extends Data.TaggedError(
  "TsconfigNotFoundError",
)<TsDoctorErrorProps> {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(buildProps(message, options));
  }
}

/** A project selector matched more than one project and could not be resolved (RULE-037). */
export class AmbiguousProjectError extends Data.TaggedError(
  "AmbiguousProjectError",
)<TsDoctorErrorProps> {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(buildProps(message, options));
  }
}

/**
 * Normalize the legacy `(message, { cause })` call shape into the `Data.TaggedError`
 * props object. `cause` is included ONLY when supplied, so an absent cause leaves
 * native `.cause` `undefined` (legacy parity, and respects `exactOptionalPropertyTypes`).
 */
function buildProps(
  message: string,
  options?: { readonly cause?: unknown },
): TsDoctorErrorProps {
  return options && "cause" in options
    ? { message, cause: options.cause }
    : { message };
}

/** The union of every concrete ts-doctor discovery error (RULE-037). */
export type AnyTsDoctorError =
  | TsDoctorError
  | ProjectNotFoundError
  | NoTypeScriptProjectError
  | TsconfigNotFoundError
  | AmbiguousProjectError;

/**
 * FROZEN set of the five discriminant tags (RULE-037). The {@link isTsDoctorError}
 * guard discriminates on membership of this set — the contract-based replacement
 * for legacy's `instanceof TsDoctorError` (see the deviation note above).
 */
export const TS_DOCTOR_ERROR_TAGS: ReadonlySet<string> = new Set([
  "TsDoctorError",
  "ProjectNotFoundError",
  "NoTypeScriptProjectError",
  "TsconfigNotFoundError",
  "AmbiguousProjectError",
]);

/**
 * Type guard: is `value` one of this tool's discovery errors (RULE-037)?
 *
 * Matches when `value` is an `Error` carrying a `_tag` in {@link TS_DOCTOR_ERROR_TAGS}.
 * Requiring `instanceof Error` (not merely a `_tag`-shaped plain object) keeps the
 * guard honest: it answers "is this one of OUR thrown errors?", parity with
 * legacy's `instanceof TsDoctorError`.
 */
export function isTsDoctorError(value: unknown): value is AnyTsDoctorError {
  if (!(value instanceof Error)) return false;
  const tag = (value as { _tag?: unknown })._tag;
  return typeof tag === "string" && TS_DOCTOR_ERROR_TAGS.has(tag);
}

/**
 * Tagged error classes (AI_NATIVE_SPEC §3.2).
 *
 * Replaces react-doctor's Effect tagged errors with plain `Error` subclasses
 * carrying a discriminant `name` (and `_tag` alias) so callers can branch
 * structurally without a runtime framework. `cause` is supported for chaining.
 */

/** Base class for every error this tool throws. */
export class TsDoctorError extends Error {
  /** Stable discriminant, mirrored onto `name`. */
  readonly _tag: string = "TsDoctorError";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions | undefined);
    this.name = "TsDoctorError";
    // Restore prototype chain across the ES5 target transpile boundary.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** No project root could be located at/under the given directory. */
export class ProjectNotFoundError extends TsDoctorError {
  override readonly _tag = "ProjectNotFoundError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProjectNotFoundError";
  }
}

/** The directory has no resolvable `typescript` / no `.ts` sources (BC-06). */
export class NoTypeScriptProjectError extends TsDoctorError {
  override readonly _tag = "NoTypeScriptProjectError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NoTypeScriptProjectError";
  }
}

/** No `tsconfig.json` was found (BC-06). */
export class TsconfigNotFoundError extends TsDoctorError {
  override readonly _tag = "TsconfigNotFoundError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TsconfigNotFoundError";
  }
}

/** A project selector matched more than one project and could not be resolved. */
export class AmbiguousProjectError extends TsDoctorError {
  override readonly _tag = "AmbiguousProjectError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AmbiguousProjectError";
  }
}

/** Type guard: is `value` any TsDoctorError? */
export function isTsDoctorError(value: unknown): value is TsDoctorError {
  return value instanceof TsDoctorError;
}

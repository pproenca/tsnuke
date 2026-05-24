/**
 * Glob ReDoS caps (C16, BC-17). FROZEN verbatim from react-doctor.
 *
 * A user-supplied glob with a pathological number of wildcards or excessive
 * length can drive catastrophic backtracking when compiled to a RegExp.
 * `validateGlobPattern` rejects patterns over the frozen caps before any
 * compilation happens.
 *
 * See AI_NATIVE_SPEC.md §3 — "Freeze verbatim."
 */

/** Maximum allowed glob pattern length (chars). */
export const MAX_GLOB_PATTERN_LENGTH = 1024;
/** Maximum allowed wildcard characters (`*` / `?`) in a glob pattern. */
export const MAX_GLOB_PATTERN_WILDCARDS = 24;

/** Thrown when a glob pattern exceeds the frozen ReDoS caps (BC-17). */
export class InvalidGlobPatternError extends Error {
  readonly _tag = "InvalidGlobPatternError";
  constructor(message: string) {
    super(message);
    this.name = "InvalidGlobPatternError";
    Object.setPrototypeOf(this, InvalidGlobPatternError.prototype);
  }
}

/**
 * Validate a glob pattern against the frozen ReDoS caps (BC-17).
 *
 * @throws {InvalidGlobPatternError} if length > 1024 or wildcard count > 24.
 */
export function validateGlobPattern(pattern: string): void {
  if (pattern.length > MAX_GLOB_PATTERN_LENGTH) {
    throw new InvalidGlobPatternError(
      `Glob pattern too long: ${pattern.length} > ${MAX_GLOB_PATTERN_LENGTH}.`,
    );
  }
  let wildcards = 0;
  for (const ch of pattern) {
    if (ch === "*" || ch === "?") wildcards++;
  }
  if (wildcards > MAX_GLOB_PATTERN_WILDCARDS) {
    throw new InvalidGlobPatternError(
      `Glob pattern has too many wildcards: ${wildcards} > ${MAX_GLOB_PATTERN_WILDCARDS}.`,
    );
  }
}

/**
 * Glob ReDoS caps (RULE-014, BC-17). The caps are FROZEN verbatim from
 * react-doctor — see legacy `packages/core/src/security/glob.ts:13-47`.
 *
 * A user-supplied glob with a pathological number of wildcards or excessive
 * length can drive catastrophic backtracking when compiled to a `RegExp`.
 * `validateGlobPattern` rejects patterns over the frozen caps BEFORE any
 * compilation happens.
 *
 * DORMANT (RULE-027): no glob-compilation sink calls this yet — wire it at the
 * real sink when a glob compiler lands, and assert invocation in an integration
 * test (see TRANSFORMATION_NOTES.md Follow-ups).
 *
 * DEVIATION (idiomatic, TRANSFORMATION_NOTES D1): legacy modeled the rejection
 * as a hand-rolled `class InvalidGlobPatternError extends Error`. This module
 * models it as an `effect/Data` {@link https://effect.website Data.TaggedError},
 * which is the Effect-native way to define a tagged error. The observable
 * surface is preserved verbatim: `_tag === "InvalidGlobPatternError"`,
 * `name === "InvalidGlobPatternError"`, a message, and `instanceof Error`.
 */

import { Data } from "effect";

/** Maximum allowed glob pattern length (chars). FROZEN (RULE-014). */
export const MAX_GLOB_PATTERN_LENGTH = 1024;
/** Maximum allowed wildcard characters (`*` / `?`) in a glob pattern. FROZEN (RULE-014). */
export const MAX_GLOB_PATTERN_WILDCARDS = 24;

/**
 * Thrown when a glob pattern exceeds the frozen ReDoS caps (BC-17).
 *
 * An `effect/Data` tagged error: carries `_tag: "InvalidGlobPatternError"` (for
 * Effect's typed error channel / `catchTag`) while remaining a real `Error`
 * subclass — `name` is set to `"InvalidGlobPatternError"` and `instanceof Error`
 * holds, matching the legacy class's observable contract.
 */
export class InvalidGlobPatternError extends Data.TaggedError(
  "InvalidGlobPatternError",
)<{ readonly message: string }> {
  // Data.TaggedError sets `_tag` and (as a TaggedError) `message`/`name` from the
  // tag. `name` is already "InvalidGlobPatternError" via the tag; re-stated here
  // as a getter only for documentation — no override needed.
}

/**
 * Validate a glob pattern against the frozen ReDoS caps (RULE-014, BC-17).
 *
 * Plain synchronous pure function — NOT `Effect`-wrapped (Brief lines 25/91; the
 * brief wires the guard at its sink later, but the guard itself is pure). Throws
 * {@link InvalidGlobPatternError} (does not return an `Either`) to preserve the
 * legacy throwing contract verbatim.
 *
 * @throws {InvalidGlobPatternError} if `length > 1024` or wildcard count `> 24`.
 *   The length cap is checked first.
 */
export function validateGlobPattern(pattern: string): void {
  if (pattern.length > MAX_GLOB_PATTERN_LENGTH) {
    throw new InvalidGlobPatternError({
      message: `Glob pattern too long: ${pattern.length} > ${MAX_GLOB_PATTERN_LENGTH}.`,
    });
  }
  let wildcards = 0;
  for (const ch of pattern) {
    if (ch === "*" || ch === "?") wildcards++;
  }
  if (wildcards > MAX_GLOB_PATTERN_WILDCARDS) {
    throw new InvalidGlobPatternError({
      message: `Glob pattern has too many wildcards: ${wildcards} > ${MAX_GLOB_PATTERN_WILDCARDS}.`,
    });
  }
}

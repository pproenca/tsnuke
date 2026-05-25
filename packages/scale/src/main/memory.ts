/**
 * Tier-2 memory-ceiling guard — the PURE half of the scale slice (RULE-013).
 *
 * Type-checking (Tier-2) is the memory-heavy phase: it builds and holds a
 * `ts.Program`. On a deep monorepo run that can push RSS past the host limit and
 * OOM the process. RULE-013 is the graceful-degradation lever: before building
 * the next Program, ask "would current RSS plus an estimated Program cost blow the
 * ceiling?" — if so, SKIP Tier-2 (and mark the score partial) rather than crash.
 *
 * WHY THIS STAYS A PLAIN PURE FUNCTION (NOT `Effect`-wrapped):
 *   The decision is deterministic arithmetic over INJECTED inputs — RSS is passed
 *   in, not read from `process` here (determinism/testability, mirroring legacy
 *   `scale.ts:118`). There is no IO, clock, or randomness to sequence, so wrapping
 *   it in `Effect` would buy nothing and obscure the math (Brief: "don't over-apply
 *   Effect; don't wrap the pure memory check"). The Effect ecosystem appears only in
 *   the genuinely-effectful resource half ({@link ./scope.ts}). This is the same
 *   pure-core / effectful-edge split the `score` slice made for its scoring math.
 *
 * DORMANCY (carried over from legacy): in legacy this guard is unwired dead code —
 * `runEngine` builds the Program unconditionally with no memory check (RULE-013
 * "unwired dead code"; RULE-036 confirmed-defect). The fix is to WIRE this check
 * into the engine slice before each Program build (see TRANSFORMATION_NOTES
 * Follow-ups). This slice provides the correct, tested lever; it does not wire it.
 *
 * See BUSINESS_RULES.md RULE-013 and legacy `packages/core/src/scale.ts:105-125`.
 */

/**
 * Default memory ceiling (bytes) above which Tier-2 is skipped to degrade
 * gracefully rather than OOM (RULE-013). ~1.86 GiB.
 *
 * TUNABLE, NOT FROZEN: unlike the `score` slice's weights (which are frozen in code
 * so two machines compute identical scores — RULE-041), this is an *environment
 * limit*, not a scoring rule. The caller is expected to override it per host. It is
 * therefore a plain `const`, deliberately NOT `Object.freeze`d / branded — callers
 * pass their own value as the `ceilingBytes` argument.
 */
export const DEFAULT_TIER2_MEMORY_CEILING_BYTES = 2_000_000_000; // ~1.86 GiB

/**
 * Decide whether Tier-2 should be skipped under memory pressure (RULE-013).
 *
 * Returns `true` (skip Tier-2, caller sets `scorePartial = true`) when the current
 * RSS plus an estimated Program cost would exceed the ceiling:
 *
 *   `currentRssBytes + estimatedProgramBytes > ceilingBytes`
 *
 * The comparison is STRICT (`>`): landing exactly ON the ceiling does NOT skip —
 * the ceiling is the last acceptable value, faithfully preserving legacy
 * `scale.ts:124`. Pure additive comparison, no clamping (RULE-013 edge cases).
 *
 * `currentRssBytes` is INJECTED for determinism/testability — this function does
 * NOT read `process.memoryUsage()` itself. The engine that wires RULE-013 supplies
 * the live RSS at the call site.
 *
 * @param currentRssBytes      Resident set size right now, in bytes (injected).
 * @param estimatedProgramBytes Estimated additional cost of the next `ts.Program`.
 * @param ceilingBytes         Override the host limit; defaults to
 *                             {@link DEFAULT_TIER2_MEMORY_CEILING_BYTES}.
 * @returns `true` to skip Tier-2 (degrade gracefully), `false` to proceed.
 */
export function shouldSkipTier2ForMemory(
  currentRssBytes: number,
  estimatedProgramBytes: number,
  ceilingBytes: number = DEFAULT_TIER2_MEMORY_CEILING_BYTES,
): boolean {
  return currentRssBytes + estimatedProgramBytes > ceilingBytes;
}

/**
 * `@ts-doctor/scale-effect` — public surface of the Effect-TS scale slice.
 *
 * Two cleanly-separated halves of ts-doctor's scale guard:
 *
 *  - **RULE-013 — Tier-2 memory-ceiling guard** ({@link ./memory.ts}): a PURE,
 *    synchronous decision over injected RSS. NOT `Effect`-wrapped (no IO to
 *    sequence) — the same pure-core discipline the `score` slice applied.
 *  - **RULE-036 — Program resource disposal** ({@link ./scope.ts}): the legacy
 *    hand-rolled `using` / `Symbol.dispose` seam re-expressed as idiomatic Effect
 *    `Scope` (`Effect.acquireRelease` / `acquireUseRelease`). Genuinely effectful,
 *    so these return `Effect<...>`. Release runs exactly once, after use, and
 *    always — including on interruption (a deliberate superset of legacy's
 *    try/finally; see TRANSFORMATION_NOTES.md).
 *
 * See TRANSFORMATION_NOTES.md for the legacy → target mapping, the
 * interruption-safety strengthening, and follow-ups (wiring both rules into the
 * engine slice, which legacy never did — RULE-013/036 are dormant in legacy).
 */

export {
  DEFAULT_TIER2_MEMORY_CEILING_BYTES,
  shouldSkipTier2ForMemory,
} from "./memory.js";

export { scopedProgram, withProgram } from "./scope.js";

// Self-barrel: lets consumers `import { Scale } from "@ts-doctor/scale-effect"` and
// reach the whole slice as a namespace, alongside the named re-exports above.
export * as Scale from "./index.js";

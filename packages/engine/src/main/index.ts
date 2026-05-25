/**
 * `@tsnuke/engine-effect` — public surface of THE integrating keystone slice.
 *
 * Wires ~12 finished strangler-fig slices into a working end-to-end analysis:
 *   - {@link runEngine} — the two-tier execution shell (RULE-018 partial-honesty gate,
 *     P0), with the `ts.Program` lifecycle going through `scale.scopedProgram` so it is
 *     RELEASED after the run (RULE-036 cure — legacy never disposed) and the RULE-013
 *     memory guard WIRED (inert by default). Returns `Effect<EngineResult, never, Scope>`.
 *   - {@link diagnose} — the orchestration: discover → capabilities → config → engine →
 *     filter → score → `DiagnoseResult`, as `Effect<…, TsNukeError, FileSystem | Path |
 *     Scope>`.
 *   - {@link diagnoseNode} — the prod runnable providing `NodeContext` + `Effect.scoped`.
 *
 * The pure planner/score/filter are consumed directly (NOT re-wrapped in Effect); only
 * the Program lifecycle + the FileSystem reads are effectful. See TRANSFORMATION_NOTES.md
 * for the legacy → target mapping, the RULE-036/013 wiring, and the `band` → `label` map.
 */

// ---- Engine (the two-tier shell, RULE-018/036/013) ----
export {
  runEngine,
  planEngineRun,
  PLUGIN_NAME,
  SKIP_REASON_NO_TYPECHECK,
  SKIP_REASON_NO_DEEP,
  SKIP_REASON_MEMORY,
  type EngineResult,
  type SourceFileInput,
  type RunEngineOptions,
  type MemoryGuard,
  type EnginePlan,
  type SeverityOverrides,
  type ActivatePredicate,
} from "./runEngine.js";

// ---- Orchestration (the public boundary) ----
export { diagnose, overridesFromConfig } from "./diagnose.js";

// ---- Orchestration types (OWNED here) ----
export type {
  DiagnoseOptions,
  DiagnoseResult,
  ScoreResult,
  ProjectInfo,
} from "./types.js";

// ---- Production runnable + Layer ----
export { diagnoseNode, NodeContext } from "./node.js";

// ---- Self-barrel: opt-in namespace import (`import { Engine } from "..."`). ADDITIVE —
// the named re-exports above remain the byte-stable surface cli + mcp import from. ---
export * as Engine from "./index.js";

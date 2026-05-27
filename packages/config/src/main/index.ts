/**
 * `@tsnuke/config-effect` — public surface of the Effect-TS config slice.
 *
 * RULE-024 (lenient config loading, drop-not-throw) END-TO-END over the
 * `TsNukeConfig` contract (RULE-040 severity vocabulary):
 *   - PURE core: `sanitizeConfig` (`sanitize.ts`) — total synchronous validation.
 *   - EFFECTFUL loader: `loadConfig`/`loadConfigWithWarnings` (`loadConfig.ts`) —
 *     the FIRST genuinely-effectful slice, an `Effect<...>` over `@effect/platform`
 *     `FileSystem` + `Path`, delegating validation to `sanitizeConfig`. Provide a
 *     Layer at the edge: `NodeContext` (production) or an in-memory stub (tests). The
 *     `*Node` helpers run it against the real disk.
 *
 * Exports are ordered schemas → types → functions, then closed by the self-barrel
 * `export * as Config from "./index.js"` so callers can `import { Config } from "..."`
 * and reach the same surface as a namespace — the named re-exports stay byte-stable.
 */

// ---- Schemas + their derived types (the config contract) ----
export {
  ConfigSeverity,
  FailOn,
  IgnoreConfig,
  IgnoreOverride,
  TsNukeConfig,
} from "./Config.js";

export type { SanitizeResult } from "./sanitize.js";

// ---- Functions (pure sanitizer + effectful loader) ----
export { sanitizeConfig } from "./sanitize.js";

export {
  loadConfig,
  loadConfigNode,
  loadConfigWithWarnings,
  loadConfigWithWarningsNode,
  NodeContext,
} from "./loadConfig.js";

// ---- P5: project-local false-positive loader (.tsnuke/false-positives.md) ----
export {
  loadFalsePositives,
  parseFalsePositives,
  type ProjectLocalSuppression,
} from "./loadFalsePositives.js";

// ---- Self-barrel: THIS is the module's namespace ----
export * as Config from "./index.js";

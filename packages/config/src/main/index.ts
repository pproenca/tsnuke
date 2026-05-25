/**
 * `@ts-doctor/config-effect` — public surface of the Effect-TS config slice.
 *
 * RULE-024 (lenient config loading, drop-not-throw) END-TO-END over the
 * `TsDoctorConfig` contract (RULE-040 severity vocabulary):
 *   - PURE core: `sanitizeConfig` (`sanitize.ts`) — total synchronous validation.
 *   - EFFECTFUL loader: `loadConfig`/`loadConfigWithWarnings` (`loadConfig.ts`) —
 *     the FIRST genuinely-effectful slice, an `Effect<...>` over `@effect/platform`
 *     `FileSystem` + `Path`, delegating validation to `sanitizeConfig`. Provide a
 *     Layer at the edge: `NodeContext` (production) or an in-memory stub (tests). The
 *     `*Node` helpers run it against the real disk.
 */

export {
  ConfigSeverity,
  FailOn,
  IgnoreConfig,
  IgnoreOverride,
  TsDoctorConfig,
} from "./Config.js";

export { sanitizeConfig, type SanitizeResult } from "./sanitize.js";

export {
  loadConfig,
  loadConfigNode,
  loadConfigWithWarnings,
  loadConfigWithWarningsNode,
  NodeContext,
} from "./loadConfig.js";

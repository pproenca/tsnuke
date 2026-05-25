/**
 * `@ts-fix/security-effect` — public surface of the Effect-TS security slice.
 *
 * Five pure security guards, FROZEN verbatim from react-doctor (domain-agnostic):
 *  - {@link validateGlobPattern} — glob ReDoS caps (RULE-014, BC-17)
 *  - {@link isSafeGitRevision}   — git ref-name guard (RULE-027, BC-15)
 *  - {@link sanitizeEnv}         — subprocess env sanitization (RULE-027, BC-19)
 *  - {@link isInsideTempDir}     — Zip-Slip defense (RULE-027, BC-16)
 *  - {@link loadConfigPlugins}   — plugins-never-loaded RCE-by-construction
 *                                  (RULE-039, P0 / BC-18)
 *
 * The guards stay PLAIN synchronous pure functions (Brief lines 25/91); the
 * Effect ecosystem appears only in the idiomatic tagged error
 * {@link InvalidGlobPatternError} (`effect/Schema`). See TRANSFORMATION_NOTES.md
 * for the legacy → target mapping and the dormant-guard follow-ups (RULE-027).
 */

export {
  InvalidGlobPatternError,
  MAX_GLOB_PATTERN_LENGTH,
  MAX_GLOB_PATTERN_WILDCARDS,
  validateGlobPattern,
} from "./Glob.js";

export { isSafeGitRevision } from "./GitRevision.js";

export { sanitizeEnv } from "./Env.js";

export { isInsideTempDir } from "./StagedFiles.js";

export {
  loadConfigPlugins,
  type LoadConfigPluginsResult,
  type LoadedPlugin,
} from "./Plugins.js";

export type { TsFixConfig } from "./Config.js";

/** Self-barrel: `import { Security } from "@ts-fix/security-effect"` resolves to this module's namespace. */
export * as Security from "./index.js";

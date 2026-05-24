/**
 * Pure security services (C16). Each is independently testable and most are
 * FROZEN verbatim from react-doctor (domain-agnostic guards).
 *
 * See REIMAGINED_ARCHITECTURE.md §3.2 / AI_NATIVE_SPEC.md §3.6.
 */

export { isSafeGitRevision } from "./git-revision.js";
export { isInsideTempDir } from "./staged-files.js";
export {
  InvalidGlobPatternError,
  MAX_GLOB_PATTERN_LENGTH,
  MAX_GLOB_PATTERN_WILDCARDS,
  validateGlobPattern,
} from "./glob.js";
export { sanitizeEnv } from "./env.js";
export {
  loadConfigPlugins,
  type LoadConfigPluginsResult,
  type LoadedPlugin,
} from "./plugins.js";

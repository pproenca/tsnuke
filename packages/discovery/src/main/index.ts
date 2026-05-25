/**
 * `@ts-doctor/discovery-effect` — public surface of the Effect-TS discovery slice.
 *
 * The biggest core module, modernized: FileSystem-based project discovery + capability
 * earning over the `@effect/platform` `FileSystem` + `Path` services, with typed errors
 * on the Effect error channel. Implements:
 *   - RULE-012 (source-file discovery caps): `countSourceFiles` (5000) / `collectSourceFiles`
 *     (10000) — EFFECTFUL fs walks over `FileSystem` (error channel `never`).
 *   - RULE-022 (project discovery validity): `discoverTsProject` — EFFECTFUL, fails with
 *     `TsconfigNotFoundError` / `NoTypeScriptProjectError` (from `@ts-doctor/errors-effect`)
 *     on the error channel; broken `package.json` is non-fatal.
 *   - RULE-021 (capability token earning): `computeCapabilities` — a PURE synchronous
 *     derivation over `ProjectInfo` (NOT Effect-wrapped).
 *
 * Provide a Layer at the edge: `NodeContext` (production) or an in-memory stub (tests).
 * The `*Node` helpers run discovery/enumeration against the real disk.
 */

export {
  BuildTool,
  ModuleSystem,
  ProjectInfo,
  ProjectKind,
} from "./ProjectInfo.js";

export {
  COLLECT_CAP,
  COUNT_CAP,
  collectSourceFiles,
  countSourceFiles,
} from "./enumerate.js";

export { discoverTsProject } from "./discover.js";

export { type Capability, computeCapabilities } from "./capabilities.js";

export {
  NodeContext,
  collectSourceFilesNode,
  countSourceFilesNode,
  discoverTsProjectNode,
} from "./node.js";

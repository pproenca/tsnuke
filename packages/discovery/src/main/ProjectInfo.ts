/**
 * The discovered-project-facts contract, as `effect/Schema` (Modernization Brief —
 * the wire/domain contract is a Schema, not a hand-rolled interface). Discovery is
 * the PRODUCER of {@link ProjectInfo}; `computeCapabilities` is its consumer.
 *
 * Mirrors the legacy `ProjectInfo` interface field-for-field
 * (`legacy/ts-doctor/packages/core/src/types.ts:22-51`). Modeling it as a Schema (not
 * a bare interface) gives callers a single runtime `Schema.decode` gate for an
 * untrusted `ProjectInfo` — but the discovery functions build a typed value directly
 * (no decode on the hot path) and `computeCapabilities` accepts an already-typed
 * value (kept pure & fast), matching the established pure-slice convention.
 *
 * OWNERSHIP NOTE: discovery is the sole producer today, so this contract is OWNED here
 * (not de-vendored from elsewhere — it is not yet duplicated). A future
 * `@ts-doctor/contracts-effect` package may host shared domain types; if it does, this
 * `ProjectInfo` is the canonical source to de-vendor onto (see TRANSFORMATION_NOTES
 * Follow-up). The `Capability` token type (a `string` in legacy `@ts-doctor/rules`)
 * lives in {@link ./capabilities.ts}.
 */

import { Schema } from "effect";

/** Project kind discriminant (RULE-021 heuristics): app / lib / monorepo / unknown. */
export const ProjectKind = Schema.Literal("app", "lib", "monorepo", "unknown");
export type ProjectKind = typeof ProjectKind.Type;

/** Module system inferred from `package.json#type` + tsconfig `module` (RULE-021). */
export const ModuleSystem = Schema.Literal("esm", "cjs");
export type ModuleSystem = typeof ModuleSystem.Type;

/** Build tool detected from deps/scripts/config files (RULE-021). `unknown` when none match. */
export const BuildTool = Schema.Literal(
  "tsc",
  "tsup",
  "vite",
  "swc",
  "esbuild",
  "bun",
  "babel",
  "unknown",
);
export type BuildTool = typeof BuildTool.Type;

/**
 * Discovered facts about a TypeScript project (C1, RULE-021/RULE-022). These
 * *produce* the capability token set. `discoverTsProject` fills this;
 * `computeCapabilities` consumes it. Mirrors legacy `types.ts:22-51`.
 */
export const ProjectInfo = Schema.Struct({
  /** Absolute path of the project root that was discovered. */
  rootDirectory: Schema.String,
  /** `package.json#name` if present (non-empty), else the directory basename. */
  projectName: Schema.String,
  /** Raw `typescript` version string (e.g. `"5.8.2"`), or null if unresolved. */
  tsVersion: Schema.NullOr(Schema.String),
  /** Major version parsed from `tsVersion`, or null. */
  tsMajor: Schema.NullOr(Schema.Number),
  projectKind: ProjectKind,
  moduleSystem: ModuleSystem,
  buildTool: BuildTool,
  /** Map of tsconfig strict-family flags that are ON (e.g. `{ strict: true }`). */
  strictFlags: Schema.Record({ key: Schema.String, value: Schema.Boolean }),
  /**
   * Whether the type-check is known-clean (BC-07). Discovery HARDCODES this `false`
   * ("PENDING", RULE-021 suspected defect) — the engine reconciles the real value
   * later from a `ts.Program`. See {@link ./discover.ts} and TRANSFORMATION_NOTES.
   */
  typecheckOk: Schema.Boolean,
  /** Count of `.ts`/`.tsx` source files discovered (capped — RULE-012). */
  sourceFileCount: Schema.Number,
});
export type ProjectInfo = typeof ProjectInfo.Type;

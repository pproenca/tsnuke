/**
 * The discovered-project-facts contract, as `effect/Schema` (Modernization Brief —
 * the wire/domain contract is a Schema, not a hand-rolled interface). Discovery is
 * the PRODUCER of {@link ProjectInfo}; `computeCapabilities` is its consumer.
 *
 * Mirrors the legacy `ProjectInfo` interface field-for-field
 * (`legacy/ts-fix/packages/core/src/types.ts:22-51`). Modeling it as a Schema (not
 * a bare interface) gives callers a single runtime `Schema.decode` gate for an
 * untrusted `ProjectInfo` — but the discovery functions build a typed value directly
 * (no decode on the hot path) and `computeCapabilities` accepts an already-typed
 * value (kept pure & fast), matching the established pure-slice convention.
 *
 * OWNERSHIP NOTE: discovery is the sole producer today, so this contract is OWNED here
 * (not de-vendored from elsewhere — it is not yet duplicated). A future
 * `@ts-fix/contracts-effect` package may host shared domain types; if it does, this
 * `ProjectInfo` is the canonical source to de-vendor onto (see TRANSFORMATION_NOTES
 * Follow-up). The `Capability` token type (a `string` in legacy `@ts-fix/rules`)
 * lives in {@link ./capabilities.ts}.
 */

import { Schema } from "effect";

/** Project kind discriminant (RULE-021 heuristics): app / lib / monorepo / unknown. */
export const ProjectKind = Schema.Literal("app", "lib", "monorepo", "unknown").annotations({
  identifier: "ProjectKind",
});
export type ProjectKind = typeof ProjectKind.Type;

/** Module system inferred from `package.json#type` + tsconfig `module` (RULE-021). */
export const ModuleSystem = Schema.Literal("esm", "cjs").annotations({
  identifier: "ModuleSystem",
});
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
).annotations({ identifier: "BuildTool" });
export type BuildTool = typeof BuildTool.Type;

/**
 * Discovered facts about a TypeScript project (C1, RULE-021/RULE-022). These
 * *produce* the capability token set. `discoverTsProject` fills this;
 * `computeCapabilities` consumes it. Mirrors legacy `types.ts:22-51`.
 */
export const ProjectInfo = Schema.Struct({
  rootDirectory: Schema.String.annotations({
    description: "Absolute path of the project root that was discovered.",
  }),
  projectName: Schema.String.annotations({
    description: "`package.json#name` if present (non-empty), else the directory basename.",
  }),
  tsVersion: Schema.NullOr(Schema.String).annotations({
    description: 'Raw `typescript` version string (e.g. `"5.8.2"`), or null if unresolved.',
  }),
  tsMajor: Schema.NullOr(Schema.Number).annotations({
    description: "Major version parsed from `tsVersion`, or null.",
  }),
  projectKind: ProjectKind,
  moduleSystem: ModuleSystem,
  buildTool: BuildTool,
  strictFlags: Schema.Record({ key: Schema.String, value: Schema.Boolean }).annotations({
    description: "Map of tsconfig strict-family flags that are ON (e.g. `{ strict: true }`).",
  }),
  typecheckOk: Schema.Boolean.annotations({
    description:
      "Whether the type-check is known-clean (BC-07). Discovery HARDCODES this `false` " +
      '("PENDING", RULE-021 suspected defect) — the engine reconciles the real value ' +
      "later from a `ts.Program`. See ./discover.ts and TRANSFORMATION_NOTES.",
  }),
  sourceFileCount: Schema.Number.annotations({
    description: "Count of `.ts`/`.tsx` source files discovered (capped — RULE-012).",
  }),
}).annotations({ identifier: "ProjectInfo" });
export type ProjectInfo = typeof ProjectInfo.Type;

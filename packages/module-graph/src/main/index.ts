/**
 * `@tsnuke/module-graph-effect` — the GRAPH-tier module-graph builder.
 *
 * Publishes the single pure entry point {@link buildModuleGraph} (and the
 * {@link GraphFileInput} input shape it consumes). The engine collects the
 * in-project source files (via discovery / `collectSourceFiles`), reads their
 * text, calls `buildModuleGraph`, and feeds the resulting `ModuleGraph` to the
 * GRAPH rules (e.g. RULE-015 cycle detection) via `runGraphRule`.
 *
 * The `ModuleGraph` TYPE is owned by — and imported from — `@tsnuke/rules-core-effect`;
 * this slice does NOT re-export it (barrel hygiene: it publishes only what it owns).
 * See TRANSFORMATION_NOTES.md for the legacy → target mapping.
 */

export { buildModuleGraph } from "./buildModuleGraph.js";
export type { GraphFileInput } from "./buildModuleGraph.js";

// Self-barrel: backs `import { ModuleGraph } from "@tsnuke/module-graph-effect"`
// then `ModuleGraph.buildModuleGraph(...)` — additive, the named exports above stay.
export * as ModuleGraph from "./index.js";

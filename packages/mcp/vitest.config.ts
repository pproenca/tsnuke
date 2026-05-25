import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // EVERY `@ts-doctor/*` dependency this slice consumes is a `file:` link whose entry
    // point is a `.ts` file (`exports: "./src/main/index.ts"`). Inline ALL of them — plus
    // their full transitive `.ts`-entry closure — so Vitest's esbuild transform compiles
    // their TypeScript at test time instead of trying to load them as pre-built deps
    // (which would fail to parse the `.ts`). The MCP server pulls the engine slice, which
    // in turn aggregates the widest closure (~12 direct slices + the whole rule catalog the
    // registry aggregates), so this list mirrors the engine's inline closure plus the
    // format slice this server also consumes directly. Same `server.deps.inline` pattern as
    // engine/format/rules-registry.
    server: {
      deps: {
        inline: [
          // Direct deps this slice imports.
          "@ts-doctor/contracts-effect",
          "@ts-doctor/engine-effect",
          "@ts-doctor/format-effect",
          "@ts-doctor/rules-registry-effect",
          // Transitive: the engine's direct slice closure.
          "@ts-doctor/capabilities-effect",
          "@ts-doctor/config-effect",
          "@ts-doctor/discovery-effect",
          "@ts-doctor/engine-plan-effect",
          "@ts-doctor/errors-effect",
          "@ts-doctor/filter-pipeline-effect",
          "@ts-doctor/module-graph-effect",
          "@ts-doctor/rules-core-effect",
          "@ts-doctor/scale-effect",
          "@ts-doctor/score-effect",
          // Transitive: every per-category rule slice the registry aggregates.
          "@ts-doctor/rules-type-performance-effect",
          "@ts-doctor/rules-declaration-api-effect",
          "@ts-doctor/rules-security-effect",
          "@ts-doctor/rules-naming-idioms-effect",
          "@ts-doctor/rules-generics-effect",
          "@ts-doctor/rules-type-assertions-effect",
          "@ts-doctor/rules-async-effect",
          "@ts-doctor/rules-error-handling-effect",
          "@ts-doctor/rules-type-safety-effect",
          "@ts-doctor/rules-exhaustiveness-effect",
          "@ts-doctor/rules-module-boundaries-effect",
          "@ts-doctor/rules-graph-effect",
        ],
      },
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // EVERY `@tsnuke/*` dependency this slice consumes is a `file:` link whose entry
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
          "@tsnuke/contracts-effect",
          "@tsnuke/engine-effect",
          "@tsnuke/format-effect",
          "@tsnuke/rules-registry-effect",
          // Transitive: the engine's direct slice closure.
          "@tsnuke/capabilities-effect",
          "@tsnuke/config-effect",
          "@tsnuke/discovery-effect",
          "@tsnuke/engine-plan-effect",
          "@tsnuke/errors-effect",
          "@tsnuke/filter-pipeline-effect",
          "@tsnuke/module-graph-effect",
          "@tsnuke/rules-core-effect",
          "@tsnuke/scale-effect",
          "@tsnuke/score-effect",
          // Transitive: every per-category rule slice the registry aggregates.
          "@tsnuke/rules-type-performance-effect",
          "@tsnuke/rules-declaration-api-effect",
          "@tsnuke/rules-security-effect",
          "@tsnuke/rules-naming-idioms-effect",
          "@tsnuke/rules-generics-effect",
          "@tsnuke/rules-type-assertions-effect",
          "@tsnuke/rules-async-effect",
          "@tsnuke/rules-error-handling-effect",
          "@tsnuke/rules-type-safety-effect",
          "@tsnuke/rules-exhaustiveness-effect",
          "@tsnuke/rules-module-boundaries-effect",
          "@tsnuke/rules-graph-effect",
        ],
      },
    },
  },
});

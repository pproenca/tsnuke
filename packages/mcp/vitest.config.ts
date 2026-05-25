import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // EVERY `@ts-fix/*` dependency this slice consumes is a `file:` link whose entry
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
          "@ts-fix/contracts-effect",
          "@ts-fix/engine-effect",
          "@ts-fix/format-effect",
          "@ts-fix/rules-registry-effect",
          // Transitive: the engine's direct slice closure.
          "@ts-fix/capabilities-effect",
          "@ts-fix/config-effect",
          "@ts-fix/discovery-effect",
          "@ts-fix/engine-plan-effect",
          "@ts-fix/errors-effect",
          "@ts-fix/filter-pipeline-effect",
          "@ts-fix/module-graph-effect",
          "@ts-fix/rules-core-effect",
          "@ts-fix/scale-effect",
          "@ts-fix/score-effect",
          // Transitive: every per-category rule slice the registry aggregates.
          "@ts-fix/rules-type-performance-effect",
          "@ts-fix/rules-declaration-api-effect",
          "@ts-fix/rules-security-effect",
          "@ts-fix/rules-naming-idioms-effect",
          "@ts-fix/rules-generics-effect",
          "@ts-fix/rules-type-assertions-effect",
          "@ts-fix/rules-async-effect",
          "@ts-fix/rules-error-handling-effect",
          "@ts-fix/rules-type-safety-effect",
          "@ts-fix/rules-exhaustiveness-effect",
          "@ts-fix/rules-module-boundaries-effect",
          "@ts-fix/rules-graph-effect",
        ],
      },
    },
  },
});

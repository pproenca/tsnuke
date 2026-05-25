import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // EVERY `@ts-fix/*` dependency the engine consumes is a `file:` link whose entry
    // point is a `.ts` file (`exports: "./src/main/index.ts"`). Inline ALL of them — plus
    // their full transitive `.ts`-entry closure — so Vitest's esbuild transform compiles
    // their TypeScript at test time instead of trying to load them as pre-built deps
    // (which would fail to parse the `.ts`). This is the same `server.deps.inline` pattern
    // build-report/rules-registry use; the engine just pulls the widest closure (~12 direct
    // slices + the whole rule catalog the registry aggregates).
    server: {
      deps: {
        inline: [
          // Direct deps the engine imports.
          "@ts-fix/capabilities-effect",
          "@ts-fix/config-effect",
          "@ts-fix/contracts-effect",
          "@ts-fix/discovery-effect",
          "@ts-fix/engine-plan-effect",
          "@ts-fix/errors-effect",
          "@ts-fix/filter-pipeline-effect",
          "@ts-fix/module-graph-effect",
          "@ts-fix/rules-core-effect",
          "@ts-fix/rules-registry-effect",
          "@ts-fix/scale-effect",
          "@ts-fix/score-effect",
          // Transitive: every per-category rule slice the registry aggregates (each a
          // `.ts`-entry `file:` dep). Without these, importing `ruleRegistry` /
          // `graphRuleRegistry` would fail to parse their `.ts` sources at test time.
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

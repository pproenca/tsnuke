import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // EVERY `@tsnuke/*` dependency the engine consumes is a `file:` link whose entry
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
          "@tsnuke/capabilities-effect",
          "@tsnuke/config-effect",
          "@tsnuke/contracts-effect",
          "@tsnuke/discovery-effect",
          "@tsnuke/engine-plan-effect",
          "@tsnuke/errors-effect",
          "@tsnuke/filter-pipeline-effect",
          "@tsnuke/module-graph-effect",
          "@tsnuke/rules-core-effect",
          "@tsnuke/rules-registry-effect",
          "@tsnuke/scale-effect",
          "@tsnuke/score-effect",
          // Transitive: every per-category rule slice the registry aggregates (each a
          // `.ts`-entry `file:` dep). Without these, importing `ruleRegistry` /
          // `graphRuleRegistry` would fail to parse their `.ts` sources at test time.
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

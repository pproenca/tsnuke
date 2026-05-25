import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // The e2e tests build a REAL `ts.Program` per case (3-8s each under load); the 5s
    // Vitest default times them out non-deterministically when the machine is busy. Raise
    // the per-test timeout so the real-compile cases run reliably (they assert real engine
    // output end-to-end). Unit/handler tests are unaffected (they finish in ms).
    testTimeout: 60000,
    // EVERY `@ts-doctor/*` dependency the CLI consumes is a `file:` link whose entry
    // point is a `.ts` file (`exports: "./src/main/index.ts"`). Inline ALL of them — plus
    // their full transitive `.ts`-entry closure — so Vitest's esbuild transform compiles
    // their TypeScript at test time instead of trying to load them as pre-built deps
    // (which would fail to parse the `.ts`). Same `server.deps.inline` pattern the engine
    // slice uses; the CLI pulls the widest closure (the engine + all four output/exit/fix
    // slices + the whole rule catalog the registry aggregates).
    server: {
      deps: {
        inline: [
          // Direct deps the CLI imports.
          "@ts-doctor/build-report-effect",
          "@ts-doctor/contracts-effect",
          "@ts-doctor/engine-effect",
          "@ts-doctor/exit-code-effect",
          "@ts-doctor/fix-applier-effect",
          "@ts-doctor/format-effect",
          "@ts-doctor/rules-registry-effect",
          // Transitive: the engine + build-report pull these in.
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
          // Transitive: every per-category rule slice the registry aggregates (each a
          // `.ts`-entry `file:` dep). Without these, importing `ruleRegistry` /
          // `graphRuleRegistry` would fail to parse their `.ts` sources at test time.
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

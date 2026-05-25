import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // The e2e tests build a REAL `ts.Program` per case (3-8s each under load); the 5s
    // Vitest default times them out non-deterministically when the machine is busy. Raise
    // the per-test timeout so the real-compile cases run reliably (they assert real engine
    // output end-to-end). Unit/handler tests are unaffected (they finish in ms).
    testTimeout: 60000,
    // EVERY `@ts-fix/*` dependency the CLI consumes is a `file:` link whose entry
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
          "@ts-fix/build-report-effect",
          "@ts-fix/contracts-effect",
          "@ts-fix/engine-effect",
          "@ts-fix/exit-code-effect",
          "@ts-fix/fix-applier-effect",
          "@ts-fix/format-effect",
          "@ts-fix/rules-registry-effect",
          // Transitive: the engine + build-report pull these in.
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

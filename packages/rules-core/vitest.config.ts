import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // `runTypeAwareRule` builds a real one-file `ts.Program` over the full default lib
    // (so the checker resolves `Promise`, unions, etc.). That parse+bind is inherently
    // slow and gets slower under parallel CPU contention — comfortably past Vitest's 5s
    // default. Give the TYP-driver tests headroom so a busy machine doesn't false-fail
    // a green test (the work is correct, just not fast). Production code is untouched.
    testTimeout: 30000,
    // The `@tsnuke/contracts-effect` dependency is a `file:` link whose entry
    // point is a `.ts` file (`exports: "./src/main/index.ts"`). Inline it so
    // Vitest's esbuild transform compiles its TypeScript at test time instead of
    // trying to load it as a pre-built dependency (which would fail to parse the
    // `.ts`). Same pattern the build-report slice uses for `@tsnuke/score-effect`.
    server: {
      deps: {
        inline: ["@tsnuke/contracts-effect"],
      },
    },
  },
});

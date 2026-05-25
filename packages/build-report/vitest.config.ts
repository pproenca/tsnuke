import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // The `@tsnuke/score-effect` dependency is a `file:` link whose entry point
    // is a `.ts` file (`exports: "./src/main/index.ts"`). Inline it so Vitest's
    // esbuild transform compiles its TypeScript at test time instead of trying to
    // load it as a pre-built dependency (which would fail to parse the `.ts`).
    server: {
      deps: {
        // Both `@tsnuke/score-effect` and `@tsnuke/contracts-effect` (the
        // de-vendored Diagnostic family home) are `.ts`-entry `file:` deps — inline both
        // so Vitest's esbuild transform compiles their TypeScript at test time instead of
        // trying to load them as pre-built deps (which would fail to parse the `.ts`).
        // Note: score-effect itself now imports contracts-effect, so it must be inlined too.
        inline: ["@tsnuke/score-effect", "@tsnuke/contracts-effect"],
      },
    },
  },
});

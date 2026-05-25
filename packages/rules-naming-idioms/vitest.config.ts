import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // Both `@tsnuke/rules-core-effect` and `@tsnuke/contracts-effect` are
    // `.ts`-entry `file:` deps (`exports: "./src/main/index.ts"`). Inline both so
    // Vitest's esbuild transform compiles their TypeScript at test time instead of
    // trying to load them as pre-built deps (which would fail to parse the `.ts`).
    // Same pattern the build-report slice uses for its two `file:` deps.
    // Note: rules-core-effect itself imports contracts-effect, so it must be inlined too.
    server: {
      deps: {
        inline: ["@tsnuke/rules-core-effect", "@tsnuke/contracts-effect"],
      },
    },
  },
});

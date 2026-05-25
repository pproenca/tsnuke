import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // Both `@tsnuke/rules-core-effect` and `@tsnuke/contracts-effect` are `file:`
    // links whose entry point is a `.ts` file (`exports: "./src/main/index.ts"`). Inline
    // them so Vitest's esbuild transform compiles their TypeScript at test time instead of
    // trying to load them as pre-built dependencies (which would fail to parse the `.ts`).
    // Note: rules-core itself imports contracts-effect, so contracts must be inlined too.
    // Same pattern the type-performance sibling uses.
    server: {
      deps: {
        inline: ["@tsnuke/rules-core-effect", "@tsnuke/contracts-effect"],
      },
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // The `@tsnuke/contracts-effect` dependency is a `file:` link whose entry point
    // is a `.ts` file (`exports: "./src/main/index.ts"`). Inline it so Vitest's esbuild
    // transform compiles its TypeScript at test time instead of trying to load it as a
    // pre-built dependency (which would fail to parse the `.ts`).
    server: {
      deps: {
        inline: ["@tsnuke/contracts-effect"],
      },
    },
  },
});

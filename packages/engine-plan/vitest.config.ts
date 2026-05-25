import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // The `@ts-fix/capabilities-effect` dependency is a `file:` link whose entry
    // point is a `.ts` file (`exports: "./src/main/index.ts"`). Inline it so Vitest's
    // esbuild transform compiles its TypeScript at test time instead of trying to
    // load it as a pre-built dependency (which would fail to parse the `.ts`).
    // Mirrors how build-report inlines `@ts-fix/score-effect`.
    server: {
      deps: {
        // capabilities-effect now de-vendors its contract Schemas from
        // @ts-fix/contracts-effect (also a `.ts`-entry `file:` dep), so inline both.
        inline: ["@ts-fix/capabilities-effect", "@ts-fix/contracts-effect"],
      },
    },
  },
});

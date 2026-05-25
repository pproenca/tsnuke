import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // The `@tsnuke/capabilities-effect` dependency is a `file:` link whose entry
    // point is a `.ts` file (`exports: "./src/main/index.ts"`). Inline it so Vitest's
    // esbuild transform compiles its TypeScript at test time instead of trying to
    // load it as a pre-built dependency (which would fail to parse the `.ts`).
    // Mirrors how build-report inlines `@tsnuke/score-effect`.
    server: {
      deps: {
        // capabilities-effect now de-vendors its contract Schemas from
        // @tsnuke/contracts-effect (also a `.ts`-entry `file:` dep), so inline both.
        inline: ["@tsnuke/capabilities-effect", "@tsnuke/contracts-effect"],
      },
    },
  },
});

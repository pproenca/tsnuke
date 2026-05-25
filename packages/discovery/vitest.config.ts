import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // `@ts-fix/contracts-effect` is a `.ts`-entry `file:` dep (the canonical
    // `Capability` type now comes from there). Inline it so Vitest's esbuild transform
    // compiles its TypeScript at test time. (`Capability` is a type-only import here, so
    // it is erased at runtime; this is listed for consistency with the de-vendor pattern.)
    server: {
      deps: {
        inline: ["@ts-fix/contracts-effect"],
      },
    },
  },
});

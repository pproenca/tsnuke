import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // `@tsnuke/rules-core-effect` (and, transitively, `@tsnuke/contracts-effect`)
    // are `file:` links whose entry point is a `.ts` file (`exports: "./src/main/index.ts"`).
    // We only import the `ModuleGraph` TYPE from rules-core (`import type` — erased at
    // runtime under verbatimModuleSyntax), so Vitest never actually loads its JS. The
    // inline list is kept defensively (same pattern as the type-performance slice): if any
    // future value-import or transitive transpile of the `.ts` entry appears, esbuild
    // compiles it at test time rather than failing to parse it as a pre-built dependency.
    server: {
      deps: {
        inline: ["@tsnuke/rules-core-effect", "@tsnuke/contracts-effect"],
      },
    },
  },
});

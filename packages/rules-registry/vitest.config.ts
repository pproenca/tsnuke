import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // EVERY dependency this aggregator pulls in is a `file:` link whose entry point is a
    // `.ts` file (`exports: "./src/main/index.ts"`). Inline ALL of them so Vitest's
    // esbuild transform compiles their TypeScript at test time instead of trying to load
    // them as pre-built deps (which would fail to parse the `.ts`). This list is the full
    // transitive closure of `.ts`-entry deps: the 13 rule packages + the contracts package
    // they all import (`Diagnostic`/`RuleMeta`); the rule slices also import each other's
    // substrate (`rules-core-effect`), which is already in the list.
    server: {
      deps: {
        inline: [
          "@tsnuke/contracts-effect",
          "@tsnuke/rules-core-effect",
          "@tsnuke/rules-type-performance-effect",
          "@tsnuke/rules-declaration-api-effect",
          "@tsnuke/rules-security-effect",
          "@tsnuke/rules-naming-idioms-effect",
          "@tsnuke/rules-generics-effect",
          "@tsnuke/rules-type-assertions-effect",
          "@tsnuke/rules-async-effect",
          "@tsnuke/rules-error-handling-effect",
          "@tsnuke/rules-type-safety-effect",
          "@tsnuke/rules-exhaustiveness-effect",
          "@tsnuke/rules-module-boundaries-effect",
          "@tsnuke/rules-graph-effect",
        ],
      },
    },
  },
});

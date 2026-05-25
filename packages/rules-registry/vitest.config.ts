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
          "@ts-doctor/contracts-effect",
          "@ts-doctor/rules-core-effect",
          "@ts-doctor/rules-type-performance-effect",
          "@ts-doctor/rules-declaration-api-effect",
          "@ts-doctor/rules-security-effect",
          "@ts-doctor/rules-naming-idioms-effect",
          "@ts-doctor/rules-generics-effect",
          "@ts-doctor/rules-type-assertions-effect",
          "@ts-doctor/rules-async-effect",
          "@ts-doctor/rules-error-handling-effect",
          "@ts-doctor/rules-type-safety-effect",
          "@ts-doctor/rules-exhaustiveness-effect",
          "@ts-doctor/rules-module-boundaries-effect",
          "@ts-doctor/rules-graph-effect",
        ],
      },
    },
  },
});

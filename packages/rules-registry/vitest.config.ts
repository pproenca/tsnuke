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
          "@ts-fix/contracts-effect",
          "@ts-fix/rules-core-effect",
          "@ts-fix/rules-type-performance-effect",
          "@ts-fix/rules-declaration-api-effect",
          "@ts-fix/rules-security-effect",
          "@ts-fix/rules-naming-idioms-effect",
          "@ts-fix/rules-generics-effect",
          "@ts-fix/rules-type-assertions-effect",
          "@ts-fix/rules-async-effect",
          "@ts-fix/rules-error-handling-effect",
          "@ts-fix/rules-type-safety-effect",
          "@ts-fix/rules-exhaustiveness-effect",
          "@ts-fix/rules-module-boundaries-effect",
          "@ts-fix/rules-graph-effect",
        ],
      },
    },
  },
});

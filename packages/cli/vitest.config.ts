import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    // Tests deliberately exercise the default-pretty path of the CLI and the
    // `resolveInspectFlags` decode. When developers run `pnpm test` from inside a
    // coding-agent shell (Claude Code, Cursor, OpenCode), `CLAUDECODE`/`CURSOR_AGENT`/
    // `OPENCODE` are inherited and would auto-engage `--format agent`, breaking the
    // assertions. The `TSNUKE_NO_AUTO_AGENT` opt-out (documented in `inspectCommand.ts`)
    // suppresses that detection — set it for the test process so behavior is the same
    // whether tests run in CI, in a vanilla terminal, or inside a coding-agent session.
    env: { TSNUKE_NO_AUTO_AGENT: "1" },
    // The e2e tests build a REAL `ts.Program` per case (3-8s each under load); the 5s
    // Vitest default times them out non-deterministically when the machine is busy. Raise
    // the per-test timeout so the real-compile cases run reliably (they assert real engine
    // output end-to-end). Unit/handler tests are unaffected (they finish in ms).
    testTimeout: 60000,
    // EVERY `@tsnuke/*` dependency the CLI consumes is a `file:` link whose entry
    // point is a `.ts` file (`exports: "./src/main/index.ts"`). Inline ALL of them — plus
    // their full transitive `.ts`-entry closure — so Vitest's esbuild transform compiles
    // their TypeScript at test time instead of trying to load them as pre-built deps
    // (which would fail to parse the `.ts`). Same `server.deps.inline` pattern the engine
    // slice uses; the CLI pulls the widest closure (the engine + all four output/exit/fix
    // slices + the whole rule catalog the registry aggregates).
    server: {
      deps: {
        inline: [
          // Direct deps the CLI imports.
          "@tsnuke/build-report-effect",
          "@tsnuke/contracts-effect",
          "@tsnuke/engine-effect",
          "@tsnuke/exit-code-effect",
          "@tsnuke/fix-applier-effect",
          "@tsnuke/format-effect",
          "@tsnuke/rules-registry-effect",
          // Transitive: the engine + build-report pull these in.
          "@tsnuke/capabilities-effect",
          "@tsnuke/config-effect",
          "@tsnuke/discovery-effect",
          "@tsnuke/engine-plan-effect",
          "@tsnuke/errors-effect",
          "@tsnuke/filter-pipeline-effect",
          "@tsnuke/module-graph-effect",
          "@tsnuke/rules-core-effect",
          "@tsnuke/scale-effect",
          "@tsnuke/score-effect",
          // Transitive: every per-category rule slice the registry aggregates (each a
          // `.ts`-entry `file:` dep). Without these, importing `ruleRegistry` /
          // `graphRuleRegistry` would fail to parse their `.ts` sources at test time.
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

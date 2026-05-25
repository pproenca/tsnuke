# tsnuke

A code-health linter and 0–100 scorer for **TypeScript** projects — the
AI-native reimagining of [`react-doctor`](../../legacy/react-doctor) for the
TypeScript domain. It runs a **two-tier engine** over the TypeScript compiler:

- **Tier-1 (syntactic)** — fast AST rules, always run.
- **Tier-2 (type-aware)** — rules that need the `TypeChecker` (floating
  promises, unsafe `any` flow, exhaustiveness, …), gated on the project actually
  type-checking.

…plus **project-level config rules** (tsconfig strictness gaps) and **module-graph
rules** (import cycles, unused exports). The score is computed **locally and
deterministically** — no network round-trip — so an agent can loop on it offline.

> **88 rules across 13 categories** (64 syntactic · 18 type-aware · 4 config · 2 graph),
> including an **anti-slop family** (`ts-idiom`) that catches LLM-generated TypeScript
> delegating to runtime/boilerplate what types, native methods, and modern idioms
> should carry — try `node packages/cli/dist/cli.js examples/slop-demo`.
> The authoritative rule list lives in `@tsnuke/rules-registry-effect`.

## Quick start

Once published, run it with no install:

```bash
npx tsnuke ./path/to/project          # pretty report + score
npx tsnuke . --score                  # just the 0–100 score
npx tsnuke . --format agent           # agent-tuned JSON (for coding agents)
```

Or install it:

```bash
npm i -D tsnuke && npx tsnuke .
```

### From source (this monorepo)

```bash
pnpm install
pnpm --filter tsnuke run build         # bundle the CLI → packages/cli/dist/cli.js
node packages/cli/dist/cli.js ./path/to/project
```

Try it on the bundled example (intentionally full of issues):

```bash
node packages/cli/dist/cli.js examples/sample-app
```

```
Score: 90/100 — Great

Async / Promises:
  src/main.ts:13:3  error  no-floating-promises  Floating promise: this Promise is never awaited or handled.
Compiler Strictness Gaps:
  tsconfig.json:1:1  warning  enable-strict  tsconfig `strict` is off — the full strict-mode check family is disabled.
Module Boundaries & Architecture:
  src/a.ts:1:1  error  no-import-cycles  Import cycle detected involving src/a.ts.
…
3 error(s), 9 warning(s).
```

## CLI

```
tsnuke [directory]               # default = inspect; directory default "."
  --score                        # print only the score (exit 0)
  --json [--json-compact]        # emit the versioned JsonReportV1
  --format agent                 # rule-deduplicated, tier+fix sorted, agent-tuned JSON
  --fix                          # apply auto-fix edits in place
  --deep / --no-deep             # force / skip the type-aware (Tier-2) pass
  --fail-on <error|warning|none> # exit-code gate (default error)
  --diff [base] | --staged       # scan only changed / staged files
  --explain <file:line>          # offline, deterministic "why did this fire" + fix guidance
tsnuke install                   # install the agent skill + git hooks (stub)
```

Exit codes: `0` ok · `1` gate tripped or error · `130` interrupted.

It analyzes **TypeScript projects** — point it at a directory with a `tsconfig.json`.

## Programmatic API

`@tsnuke/engine-effect` exposes the `diagnose()` boundary. `diagnoseNode` is the
Node runnable (provides `NodeContext` + a scoped `ts.Program`) and resolves a Promise:

```ts
import { diagnoseNode } from "@tsnuke/engine-effect";

const result = await diagnoseNode("./my-project", {});
console.log(result.score?.score, result.scorePartial, result.diagnostics.length);
```

When the project doesn't type-check, the type-aware tier is skipped and
`scorePartial` is `true` (the score is on a different, not-directly-comparable scale).

## MCP server (for coding agents)

tsnuke's primary AI-native surface is an [MCP](https://modelcontextprotocol.io)
server that exposes the linter to coding agents over stdio:

```bash
pnpm --filter @tsnuke/mcp-effect run build
node packages/mcp/dist/server.js          # speaks MCP over stdio
```

Tools:

| Tool | Args | Returns |
|---|---|---|
| `tsnuke_diagnose` | `directory`, `deep?` | a one-line score summary + the agent-tuned report (rule-deduplicated, tier+fix sorted) |
| `tsnuke_explain` | `rule` | offline, deterministic explanation of a rule (category, tier, severity, recommendation, fix kind) |
| `tsnuke_list_rules` | — | the full rule catalog (id, category, tier, severity) for discovery |

Point your agent client at the `tsnuke-mcp` binary. Everything is local and
deterministic — no network, so an agent can loop on the score offline.

## Packages

An Effect-TS v3 strangler-fig monorepo — **32 packages** (`@tsnuke/<dir>-effect`,
each with a `src/main` + `src/test` layout), built with `pnpm` + `turbo`.

| Package | Role |
|---|---|
| `@tsnuke/rules-*-effect` (13 slices) + `@tsnuke/rules-core-effect` | Rule catalog + activation substrate; `defineRule` / `defineGraphRule` |
| `@tsnuke/rules-registry-effect` | The aggregated, authoritative rule catalog |
| `@tsnuke/engine-effect` | Discovery → capabilities → two-tier engine → module graph → filter pipeline → local score → report; the `diagnose()` boundary |
| `@tsnuke/mcp-effect` | MCP server (stdio) exposing tsnuke to coding agents (`tsnuke-mcp`) |
| `tsnuke` | The published CLI (bundles the engine + rules into a self-contained binary) |

Supporting slices: `contracts` · `config` · `errors` · `exit-code` · `scale` ·
`discovery` · `capabilities` · `engine-plan` · `module-graph` · `filter-pipeline` ·
`score` · `build-report` · `format` · `fix-applier` · `security`.

## Develop

```bash
pnpm test            # vitest across all packages (1776 tests)
pnpm typecheck       # tsc --noEmit per package (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + verbatimModuleSyntax + isolatedModules)
```

**Adding a rule:** drop a `defineRule({...}, create)` (or `defineGraphRule` for
module-graph rules) in the relevant `@tsnuke/rules-<category>-effect` slice with a
colocated `*.test.ts`, then register it in `@tsnuke/rules-registry-effect`.

See `CLAUDE.md` for the architecture and the four-tier engine. The full design
lives in [`docs/AI_NATIVE_SPEC.md`](docs/AI_NATIVE_SPEC.md) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Status

The engine and all four emission tiers are proven end-to-end (run on
`examples/sample-app`). The rule catalog is curated-but-growing; the remote
score endpoint / leaderboard, ESLint adapter, and GitHub Action are deliberately
deferred (see `CLAUDE.md §7`).
</content>
</invoke>

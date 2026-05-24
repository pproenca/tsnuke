# ts-doctor

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
> should carry — try `node packages/ts-doctor/dist/cli.js examples/slop-demo`.
> The authoritative list lives in `packages/ts-doctor-rules/src/rule-registry.generated.ts`.

## Quick start

Once published, run it with no install:

```bash
npx ts-doctor ./path/to/project          # pretty report + score
npx ts-doctor . --score                  # just the 0–100 score
npx ts-doctor . --format agent           # agent-tuned JSON (for coding agents)
```

Or install it:

```bash
npm i -D ts-doctor && npx ts-doctor .
```

### From source (this monorepo)

```bash
pnpm install
pnpm --filter ts-doctor build          # bundle the CLI → packages/ts-doctor/dist/cli.js
node packages/ts-doctor/dist/cli.js ./path/to/project
```

Try it on the bundled example (intentionally full of issues):

```bash
node packages/ts-doctor/dist/cli.js examples/sample-app
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
ts-doctor [directory]            # default = inspect; directory default "."
  --score                        # print only the score (exit 0)
  --json [--json-compact]        # emit the versioned JsonReportV1
  --format agent                 # rule-deduplicated, tier+fix sorted, agent-tuned JSON
  --fix                          # apply auto-fix edits in place
  --deep / --no-deep             # force / skip the type-aware (Tier-2) pass
  --fail-on <error|warning|none> # exit-code gate (default error)
  --diff [base] | --staged       # scan only changed / staged files
  --explain <file:line>          # offline, deterministic "why did this fire" + fix guidance
ts-doctor install                # install the agent skill + git hooks (stub)
```

Exit codes: `0` ok · `1` gate tripped or error · `130` interrupted.

## Programmatic API

```ts
import { diagnose } from "@ts-doctor/api";

const result = await diagnose("./my-project");
console.log(result.score?.score, result.scorePartial, result.diagnostics.length);
```

`diagnose()` returns `{ diagnostics, score, scorePartial, skippedChecks, project, elapsedMilliseconds }`.
When the project doesn't type-check, the type-aware tier is skipped and
`scorePartial` is `true` (the score is on a different, not-directly-comparable scale).

## MCP server (for coding agents)

ts-doctor's primary AI-native surface is an [MCP](https://modelcontextprotocol.io)
server that exposes the linter to coding agents over stdio:

```bash
pnpm --filter @ts-doctor/mcp build
node packages/mcp/dist/server.js          # speaks MCP over stdio
```

Tools:

| Tool | Args | Returns |
|---|---|---|
| `ts_doctor_diagnose` | `directory`, `deep?` | a one-line score summary + the agent-tuned report (rule-deduplicated, tier+fix sorted) |
| `ts_doctor_explain` | `rule` | offline, deterministic explanation of a rule (category, tier, severity, recommendation, fix kind) |
| `ts_doctor_list_rules` | — | the full rule catalog (id, category, tier, severity) for discovery |

Point your agent client at the `ts-doctor-mcp` binary. Everything is local and
deterministic — no network, so an agent can loop on the score offline.

## Packages

| Package | Role |
|---|---|
| `ts-doctor-rules` (`@ts-doctor/rules`) | Rule catalog + activation substrate; codegen registry; `defineRule`/`defineGraphRule` |
| `@ts-doctor/core` | Discovery → capabilities → two-tier engine → module graph → filter pipeline → local score → report; security services; shared output projections (agent format, explain) |
| `@ts-doctor/api` | Thin re-export of core's `diagnose()` boundary |
| `@ts-doctor/mcp` | MCP server (stdio) exposing ts-doctor to coding agents |
| `ts-doctor` | The published CLI (bundles core + rules into a self-contained binary) |

## Develop

```bash
pnpm test            # vitest across all packages (420 tests)
pnpm typecheck       # tsc --noEmit per package (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + verbatimModuleSyntax + isolatedModules)
pnpm gen             # regenerate the rule registry after adding a rule
```

**Adding a rule:** drop `packages/ts-doctor-rules/src/rules/<category>/<id>.ts`
exporting `defineRule({...}, create)` (or `defineGraphRule` for module-graph
rules), add a colocated `<id>.test.ts`, run `pnpm gen`. The directory is the
category; an unknown directory is a fatal codegen error.

See `CLAUDE.md` for the architecture and the four-tier engine. The full design
lives in [`docs/AI_NATIVE_SPEC.md`](docs/AI_NATIVE_SPEC.md) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Publishing

All five packages are publish-ready (`files: ["dist"]`, `publishConfig` points
the libraries at `dist`, MIT licensed). The CLI and MCP server bundle
`@ts-doctor/core` + `@ts-doctor/rules` into a self-contained `dist`, so the
published `ts-doctor` binary has a single runtime dependency (`typescript`).

```bash
pnpm build         # build every package's dist
pnpm release       # pnpm -r publish (uses each package's publishConfig)
```

The `ts-doctor` package provides the `ts-doctor` binary (→ `npx ts-doctor`);
`@ts-doctor/mcp` provides `ts-doctor-mcp` (the stdio MCP server).

## Status

The engine and all four emission tiers are proven end-to-end (run on
`examples/sample-app`). This is a working v1 scaffold: the rule catalog is
curated-but-growing, and the remote score endpoint / leaderboard, ESLint
adapter, and GitHub Action are deliberately deferred (see `CLAUDE.md §7`).

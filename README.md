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

> **95 rules across 14 categories** (71 syntactic · 18 type-aware · 4 config · 2 graph),
> including an **anti-slop family** (`ts-idiom`) that catches LLM-generated TypeScript
> delegating to runtime/boilerplate what types, native methods, and modern idioms
> should carry, and a **functional-patterns family** that flags GoF / imperative class
> shapes a TS-speaker should write as a function, tagged union, or stream method
> (`no-singleton-class`, `no-mutable-builder-class`, `no-factory-class`,
> `prefer-generator-over-iterator-class`, `prefer-reduce-over-imperative-sum`,
> `prefer-group-by-over-imperative-groups`, `prefer-flatmap-over-reduce-concat`).
> Try `node packages/cli/dist/cli.js examples/slop-demo`.
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
  ╭─────╮       84 / 100  Great
  │ ╔═╗ │      █████████████████░░░
  │ ╚═╝ │      tsnuke · 0.2.0
  ╰─────╯

  Tiers   SYN ●●●●●+5  TYP ●●●  GRAPH ●●  CFG ●●●●

  Async / Promises  2 issues
    ✗ no-floating-promises  [TYP · auto-fix]
      Floating promise: this Promise is never awaited or handled. — Prefix with `await`, `return` it, or `void` it.
      src/main.ts:13:3

    ⚠ require-await  [SYN · manual]
      `async` function has no `await` expression. — Remove `async`, or add the `await` this function was meant to use.
      src/store-slop.ts:10:1

  Type Safety  9 issues
    ⚠ no-record-string-unknown  ×3  [SYN · manual]
      Untyped object bag — define an interface with named properties instead of `Record<string, unknown>`.
      src/cli-slop.ts:8:29
      src/cli-slop.ts:9:32
      src/store-slop.ts:5:40
    …

  25 issues across 7 files · 95 rules checked · 255ms
  → Run `tsnuke --fix` to auto-resolve 1 issue. (0 codemod, 24 manual remaining)
```

The left-column panel is a **nuke gauge** — it escalates as the score drops:

```
  ╭─────╮      ╭─────╮      ╭─────╮
  │ ╔═╗ │      │ ░░░ │      │ ▓█▓ │
  │ ╚═╝ │      │ ╲│╱ │      │ ╱│╲ │
  ╰─────╯      ╰─────╯      ╰─────╯
   Great        Needs work    Critical
   (≥ 75)       (≥ 50)        (< 50)
  contained    smoke rising   mushroom cloud
```

Rules are **deduplicated per `plugin/rule`** with occurrence counts; `--verbose`
expands every occurrence. The bar tints green/yellow/red by band, and ANSI is
auto-disabled in non-TTY / `NO_COLOR` / `CI` environments (override with `--no-color`).

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

### Monorepos

Point it at a **workspace root** (a `pnpm-workspace.yaml` or `package.json#workspaces`, with
no root `tsconfig.json` of its own) and it discovers every member package that has a
`tsconfig.json`, scores each, and reports a per-project breakdown plus a **summary = the
minimum project score** (breadth-not-depth, BC-05):

```
  Workspace  /repo  ·  4 project(s)

  ▸ packages/clean        100 / 100  Great          ██████████████████████  clean
  ▸ packages/messy         60 / 100  Needs work     █████████████░░░░░░░░░  1 err · 3 warn
  ▸ packages/half          85 / 100  Great          ███████████████████░░░  0 err · 2 warn
  ▸ apps/web               71 / 100  Needs work*    ███████████████░░░░░░░  partial · 2 warn

  ╭─────╮       60 / 100  Needs work
  │ ░░░ │      █████████████░░░░░░░
  │ ╲│╱ │      tsnuke · 0.2.0  ·  workspace score = min of 4
  ╰─────╯

  6 issues across 4 project(s) · 1 err · 5 warn · 1.8s
  → Start with `no-floating-promises` … (open packages/messy first — it pulls the score down)
```

```bash
tsnuke .            # per-project rows + min-score panel + CTA pointing at the worst member
tsnuke . --score    # just the min score across the workspace
tsnuke . --json     # one report; projects[] per package + summary rollup
```

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
| `tsnuke_diagnose` | `directory`, `deep?` | a one-line headline + the agent-tuned report (rule-deduplicated, tier+fix sorted, with `fixSummary` / `tierBreakdown` / `nextAction` headlines pre-computed) |
| `tsnuke_explain` | `rule` | offline, deterministic explanation card (category, tier, severity, fix kind, URL, recommendation) |
| `tsnuke_list_rules` | — | the full rule catalog (id, category, tier, severity) for discovery |

`tsnuke_diagnose` headline:

```
Score 84/100 — Great. 19 rule(s) fired across 25 occurrence(s) in /path.
Next: Run `tsnuke --fix` to auto-resolve 1 issue.
```

`--format agent` / MCP `report` (additive fields highlighted):

```jsonc
{
  "score": 84,
  "scoreLabel": "Great",
  "scorePartial": false,        // Tier-2 skipped → score on a partial scale (BC-03)
  "ruleCount": 19,
  "occurrenceCount": 25,
  "elapsedMs": 253,
  "fixSummary": { "autoFixable": 1, "codemod": 0, "manual": 24 },
  "tierBreakdown": {            // which tiers fired, at a glance
    "SYN":   { "rules": 10, "occurrences": 14 },
    "TYP":   { "rules": 3,  "occurrences": 4  },
    "GRAPH": { "rules": 2,  "occurrences": 3  },
    "CFG":   { "rules": 4,  "occurrences": 4  }
  },
  "nextAction": {               // the agent's first move; matches the human CTA
    "kind": "run-fix",
    "summary": "Run `tsnuke --fix` to auto-resolve 1 issue.",
    "autoFixableRules": ["no-floating-promises"]
  },
  "categories": [ /* deduped rules, sorted SYN → TYP → GRAPH → CFG, auto-fix first */ ]
}
```

Point your agent client at the `tsnuke-mcp` binary. Everything is local and
deterministic — no network, so an agent can loop on the score offline.

## Packages

An Effect-TS v3 strangler-fig monorepo — **33 packages** (`@tsnuke/<dir>-effect`,
each with a `src/main` + `src/test` layout), built with `pnpm` + `turbo`.

| Package | Role |
|---|---|
| `@tsnuke/rules-*-effect` (14 slices) + `@tsnuke/rules-core-effect` | Rule catalog + activation substrate; `defineRule` / `defineGraphRule` |
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

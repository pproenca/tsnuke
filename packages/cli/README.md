# tsnuke

A code-health linter and **0–100 scorer** for **TypeScript** projects. It runs a
**two-tier engine** over the in-process TypeScript compiler:

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
> should carry.

## Quick start

Run it with no install:

```bash
npx tsnuke ./path/to/project          # pretty report + score
npx tsnuke . --score                  # just the 0–100 score
npx tsnuke . --format agent           # agent-tuned JSON (for coding agents)
```

Or add it to a project:

```bash
npm i -D tsnuke && npx tsnuke .
```

Point it at a directory containing a `tsconfig.json`. Example output:

```
  ╭─────╮       84 / 100  Great
  │ ╔═╗ │      █████████████████░░░
  │ ╚═╝ │      tsnuke · 0.2.0
  ╰─────╯

  Tiers   SYN ●●●●●+5  TYP ●●●  GRAPH ●●  CFG ●●●●

  Async / Promises  2 issues
    ✗ no-floating-promises  [TYP · auto-fix]
      Floating promise: this Promise is never awaited or handled.
      src/main.ts:13:3

  Type Safety  9 issues
    ⚠ no-record-string-unknown  ×3  [SYN · manual]
      Untyped object bag — define an interface with named properties instead of `Record<string, unknown>`.
      src/cli-slop.ts:8:29
      src/cli-slop.ts:9:32
      src/store-slop.ts:5:40
    …

  25 issues across 7 files · 88 rules checked · 255ms
  → Run `tsnuke --fix` to auto-resolve 1 issue. (0 codemod, 24 manual remaining)
```

The left-column panel is a **nuke gauge** — it escalates as the score drops:

```
  ╭─────╮      ╭─────╮      ╭─────╮
  │ ╔═╗ │      │ ░░░ │      │ ▓█▓ │
  │ ╚═╝ │      │ ╲│╱ │      │ ╱│╲ │
  ╰─────╯      ╰─────╯      ╰─────╯
   Great        Needs work    Critical
   contained    smoke rising  mushroom cloud
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

When the project doesn't type-check, the type-aware tier is skipped and the score
is flagged **partial** (computed on a different, not-directly-comparable scale).

**Monorepos:** point it at a workspace root (`pnpm-workspace.yaml` / `package.json#workspaces`,
no root `tsconfig.json`) and it renders a per-project row (score + bar + counts) for every
member, then a workspace summary panel showing the **minimum project score** and a CTA pointing
at the project pulling it down.

## For coding agents (MCP)

tsnuke also ships an [MCP](https://modelcontextprotocol.io) server (`tsnuke-mcp`)
exposing the linter to coding agents over stdio — tools `tsnuke_diagnose`,
`tsnuke_explain`, and `tsnuke_list_rules`. The `tsnuke_diagnose` report is
rule-deduplicated and sorted **cheapest action first**, with pre-computed
`fixSummary`, `tierBreakdown`, and `nextAction` headlines so the agent doesn't
have to recompute them. Everything is local and deterministic, so an agent can
loop on the score offline.

## Links

- Source & full docs: <https://github.com/pproenca/tsnuke>
- Issues: <https://github.com/pproenca/tsnuke/issues>

MIT © Pedro Proença

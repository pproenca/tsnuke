# ts-fix

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
npx ts-fix ./path/to/project          # pretty report + score
npx ts-fix . --score                  # just the 0–100 score
npx ts-fix . --format agent           # agent-tuned JSON (for coding agents)
```

Or add it to a project:

```bash
npm i -D ts-fix && npx ts-fix .
```

Point it at a directory containing a `tsconfig.json`. Example output:

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
ts-fix [directory]               # default = inspect; directory default "."
  --score                        # print only the score (exit 0)
  --json [--json-compact]        # emit the versioned JsonReportV1
  --format agent                 # rule-deduplicated, tier+fix sorted, agent-tuned JSON
  --fix                          # apply auto-fix edits in place
  --deep / --no-deep             # force / skip the type-aware (Tier-2) pass
  --fail-on <error|warning|none> # exit-code gate (default error)
  --diff [base] | --staged       # scan only changed / staged files
  --explain <file:line>          # offline, deterministic "why did this fire" + fix guidance
ts-fix install                   # install the agent skill + git hooks (stub)
```

Exit codes: `0` ok · `1` gate tripped or error · `130` interrupted.

When the project doesn't type-check, the type-aware tier is skipped and the score
is flagged **partial** (computed on a different, not-directly-comparable scale).

## For coding agents (MCP)

ts-fix also ships an [MCP](https://modelcontextprotocol.io) server (`ts-fix-mcp`)
exposing the linter to coding agents over stdio — tools `ts_fix_diagnose`,
`ts_fix_explain`, and `ts_fix_list_rules`. Everything is local and deterministic,
so an agent can loop on the score offline.

## Links

- Source & full docs: <https://github.com/pproenca/ts-fix>
- Issues: <https://github.com/pproenca/ts-fix/issues>

MIT © Pedro Proença

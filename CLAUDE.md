# ts-doctor — agent & engineer context (knowledge-graph handoff)

> **What this is.** `ts-doctor` is an AI-native code-health linter and 0–100 scorer for **general TypeScript projects** — conceived as the `react-doctor` of TypeScript (lints + scores a codebase), rebuilt from extracted intent rather than ported. This file is the persistent context an agent or engineer loads first. Design history lives in [`docs/`](docs/).

---

## 1. The one thing to understand

react-doctor's engine (oxlint) is **type-unaware**. A TypeScript doctor's most valuable rules (floating promises, `any`-flow, exhaustiveness) need the **TypeChecker**. So ts-doctor is built on a **two-tier engine over the in-process TypeScript compiler API**:

- **Tier-1 (SYN/GRAPH/CFG)** — AST-only, always runs. On a healthy project it reuses the Program's parsed sources; on a broken project it falls back to per-file `ts.createSourceFile`.
- **Tier-2 (TYP)** — type-aware, gated on `typecheck:ok`. **Implemented**: the engine builds one shared `ts.Program`, derives `typecheck:ok` from `getPreEmitDiagnostics()` (the single build *is* the probe — §4.1), and runs TYP rules with `program.getTypeChecker()`. Live rules: `no-floating-promises`, `switch-exhaustiveness-check`. The broader TYP catalog (`no-unsafe-*`, `no-misused-promises`, `no-unnecessary-condition`, …) remains to be authored against the same seam.

The score is **local, deterministic, offline** — no network round-trip (react-doctor required one). When Tier-2 is skipped, the score is flagged `partial` and labeled *not comparable* to a full score (BC-03).

---

## 2. Architecture (5 packages)

```
ts-doctor/ (pnpm + turbo monorepo, strict ESM, Node >=22)
├── packages/
│   ├── ts-doctor-rules/   @ts-doctor/rules  — Rule Engine
│   ├── core/              @ts-doctor/core   — Diagnostic Core
│   ├── api/               @ts-doctor/api    — thin re-export of core.diagnose
│   ├── mcp/               @ts-doctor/mcp    — MCP server (stdio) for coding agents
│   └── ts-doctor/         ts-doctor         — CLI (published binary; bundles core+rules)
└── examples/
    ├── sample-app/        — runnable demo (violations across all 4 tiers)
    └── slop-demo/         — runnable demo of the AI-slop / `ts-idiom` family
```

| Package | Responsibility | Key modules |
|---|---|---|
| **`@ts-doctor/rules`** | Owns the rule catalog + activation substrate + producer-side domain types (`Diagnostic`, `Rule`, `Fix`, `Capability`, `RuleMeta`). `defineRule` visitor model; codegen registry (directory=category, file=rule; `gen:check` fails on missing metadata / unknown bucket); capability-gating predicate `shouldActivate`; diagnostic identity; presets. | `define-rule.ts`, `capabilities.ts`, `identity.ts`, `rules/<category>/*.ts`, `rule-registry.generated.ts`, `scripts/generate-rule-registry.mjs` |
| **`@ts-doctor/core`** | Discovery → capabilities (incl. `typecheck:ok`) → **two-tier orchestrator** → module graph → filter pipeline → **local score** → versioned report → security services. Owns orchestration types, top-level `diagnose()`, and the shared output projections (`format-agent`, `explain`) consumed by both the CLI and MCP. | `discover-ts-project.ts`, `engine.ts` / `engine-plan.ts`, `module-graph.ts`, `filter-pipeline.ts`, `score.ts`, `build-report.ts`, `format-agent.ts`, `explain.ts`, `scale.ts`, `security/*`, `load-config.ts`, `index.ts` |
| **`@ts-doctor/api`** | Thin, stable re-export of core's `diagnose()` boundary (the programmatic API). | `index.ts` |
| **`@ts-doctor/mcp`** | MCP server (stdio) exposing ts-doctor to coding agents — tools `ts_doctor_diagnose` / `ts_doctor_explain` / `ts_doctor_list_rules`. Pure handlers in `tools.ts` (unit-tested); SDK wiring in `server.ts`. The AI-native delivery surface. | `tools.ts`, `server.ts`, `tsup.config.ts` |
| **`ts-doctor`** (CLI) | The binary. `inspect`/`install`, flags/modes, `--fix` applier, `--format agent`, exit-code gate, offline `--explain`. Built with tsup into a self-contained `dist/cli.js` (bundles core+rules; `typescript` stays external). | `cli.ts`, `flags.ts`, `commands/inspect.ts`, `fix-applier.ts`, `format-agent.ts`, `exit-code.ts`, `explain.ts`, `tsup.config.ts` |

Engine = `ts.Program`/`SourceFile` (in-process, no subprocess). Composition = plain TS + tagged errors + a `Result` + `using`/`Symbol.dispose` for resource lifecycles (no Effect — a deliberate departure from legacy debt). git is the only subprocess (guarded).

---

## 3. Where the spec & rationale live

The authoritative design lives **outside this tree** (read these before changing behavior):

| Document | Contents |
|---|---|
| [`docs/AI_NATIVE_SPEC.md`](docs/AI_NATIVE_SPEC.md) | 20 capabilities, domain model + erDiagram, interface contracts, NFRs, **the BC-01…BC-24 behavior contract (the acceptance tests)**, recorded design decisions |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | C4 diagram, the two-tier engine (§4), scoring (§5), tech choices (§6), and the architecture-critic review with all incorporated changes (§9) |

**The behavior contract (BC-xx) is the source of truth for what the code must do.** Every acceptance test cites its BC id.

---

## 4. How to build / test / run

```bash
pnpm install                 # one install at the root links all workspaces
                             # (esbuild build is allow-listed in pnpm-workspace.yaml)

pnpm vitest run              # full acceptance suite (all packages)   → 300 pass, 0 todo
pnpm typecheck               # turbo: tsc --noEmit per package         → all clean
node packages/ts-doctor-rules/scripts/generate-rule-registry.mjs --check   # registry gen:check
pnpm gen                     # regenerate src/rule-registry.generated.ts after adding a rule

# Build + RUN the CLI (the binary is self-contained — bundles core+rules):
pnpm --filter ts-doctor run build                    # → packages/ts-doctor/dist/cli.js
node packages/ts-doctor/dist/cli.js examples/sample-app          # pretty report + score
node packages/ts-doctor/dist/cli.js examples/sample-app --score  # just the score
node packages/ts-doctor/dist/cli.js examples/sample-app --format agent   # agent JSON

# Build + RUN the MCP server (stdio; for coding agents):
pnpm --filter @ts-doctor/mcp run build               # → packages/mcp/dist/server.js
node packages/mcp/dist/server.js                     # speaks MCP over stdio
#   tools: ts_doctor_diagnose(directory, deep?) · ts_doctor_explain(rule) · ts_doctor_list_rules()
```

Notes:
- `examples/sample-app/` is a runnable demo across **all four tiers** (SYN/TYP/CFG/GRAPH); `examples/slop-demo/` targets the **AI-slop / responsibility-delegation** family (rules tagged `ts-idiom`): runtime `typeof`/`instanceof` where the type already decides, boolean guards that discard narrowing (`prefer-type-guard-predicate`), push-loops over native methods, `JSON.parse(JSON.stringify())`, assert-instead-of-validate, `as`-instead-of-`satisfies`.
- Source-package `main`/`types` point at `src/` so typecheck + vitest resolve from source without a prior build (scaffold convenience). The CLI is the exception: tsup bundles it to `dist/cli.js` for a runnable binary. (A real publish would point the libs at `dist/` and drop `workspace:*` from the CLI's published deps.)
- `diagnose()` does a full-tree source scan (`collectSourceFiles`) when no `--diff`/`--staged` include set is given.
- All tests pass (0 todo). TYP rules are exercised via `runTypeAwareRule` (a one-file `ts.Program` + checker) and end-to-end via `core/engine.test.ts`.

### Adding a rule
Drop `packages/ts-doctor-rules/src/rules/<category>/<rule-id>.ts` exporting `defineRule({...}, create)`, run `pnpm gen` (or it fails `gen:check`). `category` is derived from the directory; an unknown directory is a fatal codegen error. Tag the rule's `tier` (`SYN`/`TYP`/`GRAPH`/`CFG`) and its `requires`/`disabledBy` capability tokens.

---

## 5. Acceptance-test status (Phase E scaffold)

**104 test files · 420 passing · 0 todo.** All five packages typecheck clean under `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax` + `isolatedModules` (ts-doctor eats its own dogfood). **All four emission tiers are live, and all 13 categories are populated.**

**Catalog: 88 rules across 13 categories** (the authoritative list is `rule-registry.generated.ts`; each rule has a colocated `*.test.ts`). Tier breakdown + per-category counts:
- **SYN (64):** type-safety 6, type-assertions 12, generics 4, async 4, exhaustiveness 4, error-handling 6, naming-idioms 14, security 5, module-boundaries 3, declaration-api 4, type-performance 2. AST-only, always run.
- **TYP (18, all need the checker):** `no-floating-promises`, `switch-exhaustiveness-check`, `only-throw-error`, `no-unsafe-member-access`, `no-unsafe-call`, `no-unsafe-return`, `no-unsafe-argument`, `await-thenable`, `no-misused-promises`, `prefer-nullish-coalescing`, `no-unnecessary-boolean-literal-compare`, `no-unnecessary-condition`, `no-unnecessary-non-null-assertion`, `prefer-promise-reject-errors`, `no-unnecessary-typeof`, `no-unnecessary-instanceof`, `prefer-generic-over-any-passthrough`, **`no-for-in-array`**. Run under one shared `ts.Program` when `typecheck:ok`.
- **Anti-slop / responsibility-delegation family** (15 rules, cross-cutting, tagged `ts-idiom`): `no-unnecessary-typeof`, `no-unnecessary-instanceof`, `prefer-type-guard-predicate`, `prefer-discriminated-union`, `prefer-generic-over-any-passthrough`, `no-record-string-unknown` (untyped object bag, incl. `extends Record<…>`), `no-unsafe-object-assertion` (`x as {shape}`), `no-cast-after-guard` (check-then-`as`), `no-unknown-return` (returns `unknown`), `no-error-message-matching` (classify errors by message text), `prefer-array-methods`, `no-json-parse-stringify-clone`, `no-assertion-on-json-parse`, `prefer-satisfies-over-as`, `no-cast-in-return` — the rules that catch LLM-generated TS delegating to runtime/boilerplate what types, generics, native methods, and modern idioms should carry. `examples/sample-app/src/{cli-slop,store-slop}.ts` are real-world distillations.
- **CFG (4):** `enable-strict`, `enable-no-unchecked-indexed-access`, `enable-exact-optional-property-types`, `enable-use-unknown-in-catch` — inverted gating (fire when the flag is OFF), emitted project-level at `tsconfig.json:1:1`.
- **GRAPH (2):** `no-import-cycles`, `no-unused-exports` (app-gated, conservative) — analyze the cross-file module graph (`core/module-graph.ts`); structural, run even without `typecheck:ok`. GRAPH rules use `defineGraphRule` + a separate `graphRuleRegistry`.
- **Convention family** (tagged `convention`, reversed from AWS's TypeScript best-practices guidance — general, no AWS-specifics): `no-var`, `pascal-case-types` (class/interface/type/enum names PascalCase), `explicit-member-accessibility`. Demo: `examples/slop-demo/src/conventions.ts`. (Deliberate divergence: AWS recommends `enum`; ts-doctor keeps `prefer-union-over-enum` per modern TS / `isolatedModules` — both are tagged, so either is opt-out.)
- **Google TS Style Guide family** (reversed from the guide's Language-Features + Type-System sections, slop-focused): `triple-equals`, `no-array-constructor`, `no-wrapper-object-types`, `no-const-enum`, `no-inferrable-type-annotation`, `consistent-type-definitions`, `prefer-error-instantiation`, `no-for-in-array` (TYP). Demo: `examples/slop-demo/src/google.ts`. (`consistent-type-definitions` generalizes the size-gated `prefer-interface-for-large-object-type`; `no-const-enum` is the error-level narrowing of `prefer-union-over-enum`.)

| BC | Behavior | Status | Home |
|---|---|---|---|
| BC-01/02 | Local distinct-rule scoring (breadth-not-depth) | ✅ | `core/score.ts` |
| BC-03 | Partial-score honesty (Tier-2 skipped) | ✅ | `core/engine-plan.ts` |
| BC-04 | Score → label bands 75/50 | ✅ | `core/score.ts` |
| BC-05 | Monorepo summary = min project score | ✅ | `core/build-report.ts` |
| BC-06/07 | TS-project discovery + capability tokens | ✅ | `core/discover-ts-project.ts` |
| BC-08 | Rule activation predicate | ✅ | `rules/capabilities.ts` |
| BC-09 | Inverted strictness gating (`disabledBy`) | ✅ | `rules/capabilities.ts` |
| BC-10 | Tier tagging (SYN + **TYP both real**) | ✅ | `rules/rule-registry.test.ts`, `rules/**/no-floating-promises.test.ts`, `core/engine.test.ts` |
| BC-11/12 | Filter pipeline order + inline suppression | ✅ | `core/filter-pipeline.ts` |
| BC-13 | Deterministic diagnostic identity | ✅ | `rules/identity.ts` |
| BC-14 | Machine-applicable fixes (overlap-safe, ≤2-pass) | ✅ | `cli/fix-applier.ts` |
| BC-15/16/17/18/19 | Security: git-ref guard · Zip-Slip · glob ReDoS caps · **no scanned-repo plugins** · env sanitization | ✅ | `core/security/*` |
| BC-21 | `--fail-on` → exit code | ✅ | `cli/exit-code.ts` |
| BC-22 | Lenient config loading | ✅ | `core/load-config.ts` |
| BC-23 | Versioned JSON report (`schemaVersion:1`) | ✅ | `core/build-report.ts` |
| BC-24 | In-process scale guard (per-project Program, dispose) | ✅ | `core/scale.ts` |
| BC-20 | Remote score-API caps | ⛔ dropped v1 (C19) | documented only |

**Engine status:** all four emission tiers are live. `core/engine.ts` builds one shared `ts.Program`, derives `typecheck:ok` (the build *is* the probe — §4.1), runs SYN per-file + TYP with the checker, emits CFG rules' project-level findings at the config file, and runs GRAPH rules once over the module graph (`core/module-graph.ts`) via `graphRuleRegistry` + `defineGraphRule`.

**Pending — broader catalog:** the engine has a proven emission path for every tier and a populated category for all 13. Remaining is additive rule-authoring from the spec taxonomy: `no-unused-files` (extend the graph with reachability from entry points), `no-misused-promises`, `no-unnecessary-condition`, `no-cross-layer-import`, `consistent-type-imports`, `naming-convention`, etc. — each a new `defineRule`/`defineGraphRule` in `rules/<category>/`.

---

## 6. Legacy → modern traceability

| react-doctor (legacy) | ts-doctor (modern) | Change |
|---|---|---|
| oxlint plugin (286 React rules, type-unaware) | `@ts-doctor/rules` two-tier catalog (~45 TS rules) | domain swap React→TS; **add type-aware Tier-2** |
| `@react-doctor/core` (Effect, oxlint subprocess) | `@ts-doctor/core` (plain TS, in-process `ts.Program`) | drop Effect; in-process substrate; `using` disposal |
| Remote `/api/score` (mandatory network) + website | **local deterministic score** | drop network + website (C19) |
| Framework + React-version capability gating | TS capability gating (`ts:N`, tsconfig flags, `app`/`lib`/`monorepo`, `build:*`, `typecheck:ok`) | token-vocabulary swap; **inverted gating** for strictness rules (BC-09) |
| Scanned-repo `plugins` auto-`require` (CWE-94 RCE) | **no custom plugin loading in v1** | RCE class removed by construction (BC-18) |
| Carried verbatim | git ref-name guard, Zip-Slip, glob ReDoS caps, env sanitization, filter pipeline, diagnostic identity, versioned report, distinct-rule scoring | domain-agnostic mechanisms — proven, frozen |
| `JsonReportV1` schema | same versioned single-arm union + `tier`/`scorePartial`/`fix` fields | forward-compat preserved |
| CLI flags/modes/exit codes | same surface | rename + `--deep`/`--fix`/`--format agent` added |

---

## 7. Deferred / forward path (not in v1 scaffold)

- **Catalog expansion** — all four tiers (SYN/TYP/CFG/GRAPH) are proven and all 13 categories are populated (38 rules); author the rest of the spec taxonomy against the existing seams (`no-unused-files`, `no-misused-promises`, `no-cross-layer-import`, …).
- ~~`@ts-doctor/api`~~ — **done**: thin re-export of `core.diagnose` (`packages/api`).
- ~~runnable CLI~~ — **done**: `pnpm --filter ts-doctor build` → `node …/dist/cli.js`; `examples/sample-app` is the end-to-end demo.
- ~~MCP server~~ — **done**: `@ts-doctor/mcp` (stdio) exposes `ts_doctor_diagnose`/`ts_doctor_explain`/`ts_doctor_list_rules`. Smoke-tested end-to-end. (A future `apply_fix` tool could wrap the `--fix` applier.)
- **ESLint flat-config adapter** (C15) · **GitHub Action** (C17) · **optional remote telemetry/leaderboard** (C19, behind the proven request caps).
- **Rust/oxlint Tier-1 fast-path** if parse latency demands it (same `defineRule` interface).

---

*Generated by `/code-modernization:modernize-reimagine`. The scaffold proves the architecture end-to-end; the named pending work fills the type-aware tier.*

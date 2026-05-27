# tsnuke — agent & engineer context (knowledge-graph handoff)

> **What this is.** `tsnuke` is an AI-native code-health linter and 0–100 scorer for **general TypeScript projects** — conceived as the `react-doctor` of TypeScript (lints + scores a codebase), rebuilt from extracted intent rather than ported. This file is the persistent context an agent or engineer loads first.
>
> **Implementation note.** The codebase is an **Effect-TS v3 strangler-fig rewrite**: **33 workspace packages** under `packages/*`, each named `@tsnuke/<dir>-effect`, each with a `src/main` + `src/test` layout. Behaviour was pinned to the original (pre-Effect) design via 14 `*equivalence.test.ts` oracles. The design history in [`docs/`](docs/) records the original *target* design (which described a 5-package, "no Effect" plain-TS scaffold); the **conceptual** content there (the two-tier engine, capabilities, the BC-01…BC-24 behaviour contract, scoring, security mechanisms) is still authoritative — the **implementation** is now Effect-TS.

---

## 1. The one thing to understand

react-doctor's engine (oxlint) is **type-unaware**. A TypeScript doctor's most valuable rules (floating promises, `any`-flow, exhaustiveness) need the **TypeChecker**. So tsnuke is built on a **two-tier engine over the in-process TypeScript compiler API**:

- **Tier-1 (SYN/GRAPH/CFG)** — AST-only, always runs. On a healthy project it reuses the Program's parsed sources; on a broken project it falls back to per-file `ts.createSourceFile`.
- **Tier-2 (TYP)** — type-aware, gated on `typecheck:ok`. The engine builds one shared `ts.Program`, derives `typecheck:ok` from `getPreEmitDiagnostics()` (the single build *is* the probe — ARCHITECTURE §4.1), and runs TYP rules with `program.getTypeChecker()`. **All four tiers are live and the full 88-rule catalog runs end-to-end** (18 TYP rules read the checker).

The score is **local, deterministic, offline** — no network round-trip (react-doctor required one). When Tier-2 is skipped, the score is flagged `partial` and labeled *not comparable* to a full score (BC-03).

---

## 2. Architecture (33 packages, Effect-TS strangler-fig)

```
tsnuke/ (pnpm workspace, strict ESM, Node >=22, Effect-TS v3.21)
├── packages/                # 33 packages, each @tsnuke/<dir>-effect, src/main + src/test
│   ├── contracts/ config/ errors/ exit-code/ scale/          # foundations (no @tsnuke deps)
│   ├── capabilities/ rules-core/ score/ format/ fix-applier/  # tier 1
│   │   filter-pipeline/ security/
│   ├── discovery/ build-report/ engine-plan/ module-graph/    # tier 2
│   │   rules-{async,declaration-api,error-handling,exhaustiveness,generics,graph,
│   │           module-boundaries,naming-idioms,security,type-assertions,
│   │           type-performance,type-safety}/ rules-registry/
│   ├── engine/                                                # orchestrator (deps ~12 pkgs)
│   └── cli/ mcp/                                              # shells (delivery surfaces)
└── examples/
    ├── sample-app/        — runnable demo (violations across all 4 tiers)
    └── slop-demo/         — runnable demo of the AI-slop / `ts-idiom` family
```

Every package is `@tsnuke/<dir>-effect` (the directory name is the package name minus the `@tsnuke/` prefix and the `-effect` suffix). The two shells keep the legacy product bin names: the CLI package `tsnuke` ships `bin: tsnuke`; the MCP package `@tsnuke/mcp-effect` ships `bin: tsnuke-mcp`.

### Foundations / leaves (no `@tsnuke` deps)

| Package (`@tsnuke/…`) | Responsibility | `src/main` modules |
|---|---|---|
| **`contracts-effect`** | Canonical `effect/Schema` home for cross-cutting domain contracts (`Diagnostic`/`Severity`/`Tier`/`FixKind`/`Fix`/`TextEdit`, `RuleMeta`/`Capability`, the `TsNukeConfig` family). Pure contracts (no Effect monad) — the consolidation slice that the rules + engine import instead of vendoring. | `Diagnostic.ts`, `RuleMeta.ts`, `Config.ts`, `index.ts` |
| **`config-effect`** | Config loading: RULE-024 lenient drop-not-throw + RULE-040 severity vocabulary. Pure decode-with-fallback (`effect/Schema`) plus the effectful loader over `@effect/platform` FileSystem + Path. | `Config.ts`, `loadConfig.ts`, `sanitize.ts`, `index.ts` |
| **`errors-effect`** | Tagged discovery error classes (RULE-037): `TsNukeError`, `ProjectNotFoundError`, `NoTypeScriptProjectError`, `TsconfigNotFoundError`, `AmbiguousProjectError`. Preserves the `_tag`/`name`/`instanceof Error`/`cause` contract `build-report`'s `serializeError` depends on. | `Errors.ts`, `index.ts` |
| **`exit-code-effect`** | Exit-code gate (RULE-030/031): the `--fail-on` resolver + severity vocabulary (no `info`). Pure synchronous functions over Schema branded types. | `ExitCode.ts`, `FailOn.ts`, `resolve.ts`, `index.ts` |
| **`scale-effect`** | Scale guard: the pure Tier-2 memory-ceiling check (RULE-013) + the resource-disposal seam (RULE-036) re-expressed as idiomatic Effect `Scope` (`Effect.acquireRelease` / `acquireUseRelease`). | `memory.ts`, `scope.ts`, `index.ts` |

### Tier 1 (depend on contracts and/or rules-core)

| Package (`@tsnuke/…`) | Responsibility | `src/main` modules |
|---|---|---|
| **`capabilities-effect`** | Capability-gated rule-activation predicate (RULE-019/020): pure synchronous `shouldActivate`/`resolveSeverity` over a token `Set<string>`. | `Capabilities.ts`, `RuleMeta.ts`, `index.ts` |
| **`rules-core-effect`** | The rule **substrate**: `defineRule` + rule context/visitor shape + diagnostic identity (BC-13) + a hand-written rule registry, the AST-free `strictness` (CFG) category, and the `ModuleGraph` type (single GRAPH-tier input site). Plain-TS over the TS compiler API (visitors are sync — not Effect-wrapped). | `defineRule.ts`, `runRule.ts`, `identity.ts`, `registry.ts`, `ModuleGraph.ts`, `rules/strictness/*.ts`, `index.ts` |
| **`score-effect`** | Local health scoring (RULE-001/002/003/041): pure functions over `effect/Schema`/`Option`/branded types. | `Score.ts`, `Scoring.ts`, `index.ts` |
| **`format-effect`** | Pure output formatters: `formatAgentReport` (RULE-032 cheapest-action-first agent JSON), `renderScoreLine`/`renderPretty` (terminal), and `explain`/`explainDiagnostic` (`--explain` text). Plain pure functions (no IO). | `format-agent.ts`, `render.ts`, `explain.ts`, `index.ts` |
| **`fix-applier-effect`** | `--fix` applier (RULE-005 ≤2-pass convergence + RULE-032 auto-fix-only). Pure splicer (`applyFixes`/`groupFixesByFile`) + the file-writing shell (`applyFixesToFiles`) as an Effect over FileSystem + Path — cures CWE-59 (symlink/out-of-root reject) and non-atomic writes (temp-then-rename). | `applyFixes.ts`, `applyFixesToFiles.ts`, `pathContainment.ts`, `index.ts` |
| **`filter-pipeline-effect`** | Four-stage diagnostic filter pipeline (RULE-023/024/040): auto-suppress → severity → ignore → inline-disable. Pure synchronous stages. | `runFilterPipeline.ts`, `stages.ts`, `index.ts` |
| **`security-effect`** | Pure security guards: glob ReDoS caps (RULE-014), dormant guards (RULE-027), plugins-never-loaded (RULE-039), git-revision guard, staged-files Zip-Slip defense, env sanitization. | `Glob.ts`, `GitRevision.ts`, `StagedFiles.ts`, `Env.ts`, `Plugins.ts`, `Config.ts`, `index.ts` |

### Tier 2 (discovery, graph, reports, the rule categories)

| Package (`@tsnuke/…`) | Responsibility | `src/main` modules |
|---|---|---|
| **`discovery-effect`** | Project discovery + capability earning (RULE-012 file caps, RULE-021/022): effectful FS discovery over `@effect/platform` FileSystem + Path with typed errors on the Effect error channel, plus the pure `computeCapabilities` derivation. Also `enumerateWorkspaceProjects` — the monorepo walk (parse `pnpm-workspace.yaml`/`package.json#workspaces` globs → member dirs with a `tsconfig.json`) that feeds the BC-05 rollup. | `discover.ts`, `enumerate.ts`, `workspace.ts`, `capabilities.ts`, `ProjectInfo.ts`, `node.ts`, `index.ts` |
| **`build-report-effect`** | Versioned JSON report builder (RULE-004 summary rollup, RULE-034 schema-version + `ok`). Consumes `score-effect` for the monorepo MIN score (RULE-003). | `buildReport.ts`, `Report.ts`, `serializeError.ts`, `index.ts` |
| **`engine-plan-effect`** | Pure two-tier engine planner (RULE-018 partial-honesty, P0). Consumes `capabilities-effect`. | `EnginePlan.ts`, `index.ts` |
| **`module-graph-effect`** | Pure GRAPH-tier module-graph builder: `buildModuleGraph(files)` parses each file via the TS compiler API, resolves relative specifiers against the in-project file set, assembles the cross-file `ModuleGraph` GRAPH rules consume. Pure (no IO — reading files is the engine's concern). | `buildModuleGraph.ts`, `index.ts` |
| **`rules-*-effect` (12)** | One package per rule category (`rules-async`, `rules-declaration-api`, `rules-error-handling`, `rules-exhaustiveness`, `rules-generics`, `rules-graph`, `rules-module-boundaries`, `rules-naming-idioms`, `rules-security`, `rules-type-assertions`, `rules-type-performance`, `rules-type-safety`). Pure AST / type-aware predicates on the `rules-core` substrate (`defineRule`/`runRule`/`runTypeAwareRule`; `rules-graph` uses `defineGraphRule`/`runGraphRule`). One file per rule. | `<rule-id>.ts` per rule + `index.ts` |
| **`rules-registry-effect`** | The GLOBAL registry: aggregates all 95 rules (93 per-file SYN/TYP/CFG + 2 GRAPH) into the two registries the engine consumes (`ruleRegistry` + `graphRuleRegistry`). Hand-assembled aggregator (replaces the legacy codegen `rule-registry.generated.ts`). | `registry.ts`, `index.ts` |

### Orchestrator + shells

| Package (`@tsnuke/…`) | Responsibility | `src/main` modules |
|---|---|---|
| **`engine-effect`** | THE integrating keystone (depends on ~12 slices): the two-tier `runEngine` (RULE-018 partial-honesty gate + RULE-036 Program disposal via `Scope` + RULE-013 memory guard, wired) and the `diagnose()` orchestration (discover → capabilities → config → engine → filter → score → `DiagnoseResult`). `diagnoseWorkspace()` is the **monorepo boundary** (BC-05): root has a tsconfig → single project; else enumerate workspace members and run `diagnose` per-member, **each under its own `Effect.scoped`** so project N's `ts.Program` is released before N+1 (RULE-036 across the run). The one genuinely-effectful part is the `ts.Program` lifecycle (`scale.scopedProgram`); rule execution stays pure synchronous. `diagnose` is `Effect<…, TsNukeError, FileSystem \| Path \| Scope>`; `diagnoseNode`/`diagnoseWorkspaceNode` are the prod runnables over `NodeContext`. | `runEngine.ts`, `diagnose.ts`, `diagnoseWorkspace.ts`, `node.ts`, `types.ts`, `index.ts` |
| **`cli-effect`** (bin `tsnuke`) | The user-facing CLI on `@effect/cli`: POSIX flag parsing, auto-help, RULE-028 flag-exclusivity as `Options` constraints. Default `inspect` command + `install` subcommand; wires engine + format + fix-applier + build-report + exit-code. Built with **esbuild** (`node build.ts`) into a self-contained `dist/cli.js` (`typescript` stays external). | `cli.ts`, `bin.ts`, `flags.ts`, `inspectCommand.ts`, `inspectHandler.ts`, `installCommand.ts`, `installHandler.ts`, `index.ts` |
| **`mcp-effect`** (bin `tsnuke-mcp`) | MCP server (stdio) exposing tsnuke to coding agents — tools `tsnuke_diagnose` / `tsnuke_explain` / `tsnuke_list_rules`. Pure handlers in `tools.ts` (unit-tested); SDK wiring in `server.ts` validates tool args with `effect/Schema` (zod is gone — RULE-029). Built with esbuild (`node build.ts`) → `dist/server.js`. | `tools.ts`, `server.ts`, `schemas.ts`, `index.ts` |

Engine = `ts.Program`/`SourceFile` (in-process, no subprocess). git is the only subprocess (guarded by `security-effect`).

### Stack & dependency injection

- **`effect@^3.21`** (`effect/Schema` for all wire contracts; `effect/Data` `TaggedError` for typed errors; `Effect.fn(...)` for traced exported effects; `Scope` for resource lifecycles).
- **`@effect/platform` + `@effect/platform-node`** — `FileSystem` / `Path` service Layers. `@effect/cli` powers the CLI; `@effect/printer`/`@effect/printer-ansi` render terminal output.
- **`typescript` (^5.8)** — the analysis backend (the in-process compiler API); kept *external* in the esbuild bundles.
- **`@effect/vitest` + `vitest`** for tests; **esbuild** (`build.ts`) bundles the CLI + MCP binaries.
- **DI is platform-Layer-based, not bespoke services.** There are no `Context.Service`/`Layer.effect` service definitions; effectful code requires `FileSystem | Path` (and `Scope` where a `ts.Program` lives) on the Effect context, and the edges provide them. Each effectful slice ships a `*Node` helper (e.g. `discovery/node.ts`, `engine/node.ts`) that runs the Effect via `Effect.runPromise` (with `Effect.scoped` where needed) and provides `NodeContext` — `Layer.merge(NodeFileSystem.layer, NodePath.layer)`. Tests provide an in-memory `FileSystem.layerNoop` (or a small stub `FileSystem`) instead — no mocks.

---

## 3. Conventions (Effect-TS idioms)

The codebase follows a consistent, signature-preserving idiom set across the slices:

- **Self-barrel namespace.** Each package's `src/main/index.ts` re-exports the flat surface and is closed by an additive `export * as <Name> from "."` so callers can reach the slice as a namespace without colliding with a named export (e.g. `exit-code` binds the self-barrel as `ExitCode` only when no `ExitCode` named export already exists — otherwise a distinct namespace alias). Named re-exports stay byte-stable.
- **`Effect.fn("Ns.method")` tracing** on exported effects (e.g. `Config.load`, `Config.loadWithWarnings`, `FixApplier.applyToFilesDetailed`, `Engine.run`). The namespace matches the package; the method matches the export.
- **`.annotate({ identifier / description })`** on boundary `effect/Schema` definitions so generated/decoded shapes carry a stable name.
- **Tagged errors via `effect/Data` `TaggedError`** (`errors-effect`, `security-effect`), signature-preserving — the legacy `_tag`/`name`/`message`/`cause` contract is held by the equivalence tests; the broader move to `Schema.TaggedError` (where it stays signature-compatible) is the in-flight target.
- **Style:** no `else` (early returns), no `let`-reassignment (ternaries), functional array methods over `for`-loops where avoidable, single-word locals, inference over explicit annotations.

Note: tsnuke does **not** use a full `Context.Service` service-module pattern — its DI is platform service Layers + `*Node` runners (see §2). Most rule slices are plain-TS sync visitors (NOT Effect-wrapped); only the `ts.Program` lifecycle + filesystem reads are effectful.

---

## 4. Where the spec & rationale live

The authoritative *design* lives in [`docs/`](docs/) (read before changing behavior). These are Phase-A/C design artifacts: their **conceptual** content is current; some **concrete** claims describe the original target scaffold (5 packages, "no Effect", tsup) and are annotated where the implementation diverged to Effect-TS.

| Document | Contents |
|---|---|
| [`docs/AI_NATIVE_SPEC.md`](docs/AI_NATIVE_SPEC.md) | 20 capabilities, domain model + erDiagram, interface contracts, NFRs, **the BC-01…BC-24 behavior contract (the acceptance tests)**, recorded design decisions |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | C4 diagram, the two-tier engine (§4), scoring (§5), tech choices (§6), and the architecture-critic review (§9) |

**The behavior contract (BC-xx) is the source of truth for what the code must do.** Acceptance tests cite their BC id; the `*equivalence.test.ts` oracles additionally pin parity with the original implementation.

---

## 5. How to build / test / run

```bash
pnpm install                 # one install at the root links all 33 workspaces
                             # (esbuild build is allow-listed in pnpm-workspace.yaml)

pnpm -r run typecheck        # tsc --noEmit per package                 → all clean
pnpm -r run test             # full suite (vitest run per package)      → ~1769 pass

# Build + RUN the CLI (self-contained esbuild bundle; `typescript` stays external):
pnpm --filter tsnuke run build              # → packages/cli/dist/cli.js
node packages/cli/dist/cli.js examples/sample-app          # pretty report + score
node packages/cli/dist/cli.js examples/sample-app --score  # just the score (e.g. "Score: 84/100 — Great")
node packages/cli/dist/cli.js examples/sample-app --format agent   # agent JSON

# Build + RUN the MCP server (stdio; for coding agents):
pnpm --filter @tsnuke/mcp-effect run build             # → packages/mcp/dist/server.js
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node packages/mcp/dist/server.js
#   tools: tsnuke_diagnose(directory, deep?) · tsnuke_explain(rule) · tsnuke_list_rules()
```

Notes:
- `examples/sample-app/` is a runnable demo across **all four tiers** (SYN/TYP/CFG/GRAPH); `examples/slop-demo/` targets the **AI-slop / responsibility-delegation** family (rules tagged `ts-idiom`): runtime `typeof`/`instanceof` where the type already decides, boolean guards that discard narrowing (`prefer-type-guard-predicate`), push-loops over native methods, `JSON.parse(JSON.stringify())`, assert-instead-of-validate, `as`-instead-of-`satisfies`.
- Each package's `exports.` points at `src/main/index.ts` so typecheck + vitest resolve from source without a prior build (scaffold convenience). The CLI and MCP are the exception: esbuild bundles each runnable binary into `dist/`. (A real publish would point the libs at a built `dist/` and drop `workspace:*` from the shells' published deps.)
- `diagnose()` does a full-tree source scan when no diff/staged include set is given. Point the CLI at a **workspace root** (no root `tsconfig.json`, only per-package ones) and `diagnoseWorkspace()` discovers every member, scores each, and reports a per-project breakdown + the BC-05 min summary; point it at a single package and it behaves exactly as before.
- Tests use **no mocks** — effectful code is exercised with `@effect/platform` in-memory `FileSystem.layerNoop` (or a small stub `FileSystem`). TYP rules are exercised via `runTypeAwareRule` (a one-file `ts.Program` + checker) and end-to-end via `engine`'s tests. 14 `*equivalence.test.ts` oracles pin parity with the original implementation.

### Adding a rule
Drop `packages/rules-<category>/src/main/<rule-id>.ts` exporting `defineRule({...}, create)` (or `defineGraphRule` in `rules-graph`), add a colocated `src/test/<rule-id>.test.ts`, and register it in `rules-registry`'s `registry.ts`. Tag the rule's `tier` (`SYN`/`TYP`/`GRAPH`/`CFG`) and its `requires`/`disabledBy` capability tokens. (Registry assembly is hand-written — there is no codegen step.)

---

## 6. Catalog & acceptance-test status

**33 packages · ~177 test files · ~1900 tests passing · all packages typecheck clean** under `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax` + `isolatedModules` (tsnuke eats its own dogfood). **All four emission tiers are live, and all 14 categories are populated.**

**Catalog: 95 rules across 14 categories** (the authoritative aggregation is `rules-registry`'s `registry.ts`; each rule has a colocated `src/test/*.test.ts`). Tier breakdown:
- **SYN (71):** type-safety 6, type-assertions 12, generics 4, async 4, exhaustiveness 3, error-handling 6, naming-idioms 14, security 5, module-boundaries 3, declaration-api 4, type-performance 3, functional-patterns 7. AST-only, always run. (The 4 CFG strictness rules are counted under CFG below.)
- **TYP (18, all read the checker):** `no-floating-promises`, `switch-exhaustiveness-check`, `only-throw-error`, `no-unsafe-member-access`, `no-unsafe-call`, `no-unsafe-return`, `no-unsafe-argument`, `await-thenable`, `no-misused-promises`, `prefer-nullish-coalescing`, `no-unnecessary-boolean-literal-compare`, `no-unnecessary-condition`, `no-unnecessary-non-null-assertion`, `prefer-promise-reject-errors`, `no-unnecessary-typeof`, `no-unnecessary-instanceof`, `prefer-generic-over-any-passthrough`, `no-for-in-array`. Run under one shared `ts.Program` when `typecheck:ok`.
- **CFG (4):** `enable-strict`, `enable-no-unchecked-indexed-access`, `enable-exact-optional-property-types`, `enable-use-unknown-in-catch` — inverted gating (fire when the flag is OFF), emitted project-level at `tsconfig.json:1:1`. Live in `rules-core/src/main/rules/strictness/`.
- **GRAPH (2):** `no-import-cycles`, `no-unused-exports` (app-gated, conservative) — analyze the cross-file module graph (`module-graph`); structural, run even without `typecheck:ok`. Use `defineGraphRule` + a separate `graphRuleRegistry`.
- **Anti-slop / responsibility-delegation family** (cross-cutting, tagged `ts-idiom`): `no-unnecessary-typeof`, `no-unnecessary-instanceof`, `prefer-type-guard-predicate`, `prefer-discriminated-union`, `prefer-generic-over-any-passthrough`, `no-record-string-unknown`, `no-unsafe-object-assertion`, `no-cast-after-guard`, `no-unknown-return`, `no-error-message-matching`, `prefer-array-methods`, `no-json-parse-stringify-clone`, `no-assertion-on-json-parse`, `prefer-satisfies-over-as`, `no-cast-in-return` — the rules that catch LLM-generated TS delegating to runtime/boilerplate what types, generics, native methods, and modern idioms should carry. `examples/sample-app/src/{cli-slop,store-slop}.ts` are real-world distillations.
- **Functional-patterns family** (cross-cutting, tagged `ts-idiom`, `rules-functional-patterns`): `no-singleton-class`, `no-mutable-builder-class`, `no-factory-class`, `prefer-generator-over-iterator-class`, `prefer-reduce-over-imperative-sum`, `prefer-group-by-over-imperative-groups`, `prefer-flatmap-over-reduce-concat` — flags GoF / imperative class shapes a TS-speaker should write as a function, tagged union, or stream method. Inverts the patterns of the `implementation-functional-patterns` skill catalog: each rule's `recommendation` paraphrases the skill rule it enforces. All SYN, all `warning`, all `fixKind: manual` (no auto-fixes — each detection requires a real refactor).
- **Convention family** (tagged `convention`): `no-var`, `pascal-case-types`, `explicit-member-accessibility`. **Google TS Style Guide family** (slop-focused): `triple-equals`, `no-array-constructor`, `no-wrapper-object-types`, `no-const-enum`, `no-inferrable-type-annotation`, `consistent-type-definitions`, `prefer-error-instantiation`, `no-for-in-array` (TYP). Demo: `examples/slop-demo/src/`.

| BC | Behavior | Status | Home (`@tsnuke/…`) |
|---|---|---|---|
| BC-01/02 | Local distinct-rule scoring (breadth-not-depth) | ✅ | `score-effect` (`Scoring.ts`) |
| BC-03 | Partial-score honesty (Tier-2 skipped) | ✅ | `engine-plan-effect` (`EnginePlan.ts`) |
| BC-04 | Score → label bands 75/50 | ✅ | `score-effect` (`Score.ts`) |
| BC-05 | Monorepo summary = min project score (now wired end-to-end: point the CLI at a workspace ROOT → per-project breakdown + min summary) | ✅ | `discovery-effect` (`workspace.ts`) + `engine-effect` (`diagnoseWorkspace.ts`) + `build-report-effect` (`buildReport.ts`) |
| BC-06/07 | TS-project discovery + capability tokens | ✅ | `discovery-effect` (`discover.ts`, `capabilities.ts`) |
| BC-08 | Rule activation predicate | ✅ | `capabilities-effect` (`Capabilities.ts`) |
| BC-09 | Inverted strictness gating (`disabledBy`) | ✅ | `capabilities-effect` + `rules-core` strictness |
| BC-10 | Tier tagging (SYN + TYP both real) | ✅ | `rules-registry-effect`, `engine-effect` |
| BC-11/12 | Filter pipeline order + inline suppression | ✅ | `filter-pipeline-effect` (`runFilterPipeline.ts`, `stages.ts`) |
| BC-13 | Deterministic diagnostic identity | ✅ | `rules-core-effect` (`identity.ts`) |
| BC-14 | Machine-applicable fixes (overlap-safe, ≤2-pass) | ✅ | `fix-applier-effect` (`applyFixes.ts`) |
| BC-15/16/17/18/19 | Security: git-ref guard · Zip-Slip · glob ReDoS caps · no scanned-repo plugins · env sanitization | ✅ | `security-effect` (`GitRevision.ts`, `StagedFiles.ts`, `Glob.ts`, `Plugins.ts`, `Env.ts`) |
| BC-21 | `--fail-on` → exit code | ✅ | `exit-code-effect` (`resolve.ts`) |
| BC-22 | Lenient config loading | ✅ | `config-effect` (`loadConfig.ts`) |
| BC-23 | Versioned JSON report (`schemaVersion:1`) | ✅ | `build-report-effect` (`Report.ts`) |
| BC-24 | In-process scale guard (per-project Program, dispose) | ✅ | `scale-effect` (`scope.ts`, `memory.ts`) + `engine-effect` |
| BC-20 | Remote score-API caps | ⛔ dropped v1 (C19) | documented only |

**Engine status:** all four emission tiers are live. `engine`'s `runEngine` builds one shared `ts.Program` (through `scale.scopedProgram`, released after the run — RULE-036), derives `typecheck:ok` (the build *is* the probe — ARCHITECTURE §4.1), runs SYN per-file + TYP with the checker, emits CFG rules' project-level findings at the config file, and runs GRAPH rules once over the module graph (`module-graph`) via `graphRuleRegistry` + `defineGraphRule`.

**Pending — broader catalog:** the engine has a proven emission path for every tier and a populated category for all 13. Remaining is additive rule-authoring from the spec taxonomy: `no-unused-files` (extend the graph with reachability from entry points), `no-cross-layer-import`, `consistent-type-imports`, `naming-convention`, etc. — each a new `defineRule`/`defineGraphRule` in a `rules-<category>` slice, registered in `rules-registry`.

---

## 7. Legacy → modern traceability

tsnuke is itself a two-stage modernization. **Stage 1** reimagined react-doctor into a TypeScript doctor (the design in `docs/`, originally scaffolded as plain TS). **Stage 2** rewrote that scaffold as the current 33-package **Effect-TS** strangler-fig, pinned by equivalence oracles.

| react-doctor (legacy) | tsnuke (current Effect-TS) | Change |
|---|---|---|
| oxlint plugin (286 React rules, type-unaware) | 12 `rules-*-effect` category packages + `rules-core` substrate (88 TS rules) | domain swap React→TS; **type-aware Tier-2** real |
| `@react-doctor/core` (Effect, oxlint subprocess) | split across `engine-effect` + ~12 slices (Effect-TS v3, in-process `ts.Program`) | in-process substrate; `Scope`-based Program disposal |
| Remote `/api/score` (mandatory network) + website | **local deterministic score** (`score-effect`) | drop network + website (C19) |
| Framework + React-version capability gating | TS capability gating (`ts:N`, tsconfig flags, `app`/`lib`/`monorepo`, `build:*`, `typecheck:ok`) — `capabilities-effect` | token-vocabulary swap; **inverted gating** for strictness rules (BC-09) |
| Scanned-repo `plugins` auto-`require` (CWE-94 RCE) | **no custom plugin loading** (`security-effect` `Plugins.ts`) | RCE class removed by construction (BC-18) |
| Carried mechanisms | git ref-name guard, Zip-Slip, glob ReDoS caps, env sanitization, filter pipeline, diagnostic identity, versioned report, distinct-rule scoring | domain-agnostic mechanisms — proven, frozen, equivalence-pinned |
| `JsonReportV1` schema | same versioned single-arm union + `tier`/`scorePartial`/`fix` fields (`build-report-effect`/`contracts-effect`) | forward-compat preserved |
| CLI flags/modes/exit codes | same surface, re-imagined on `@effect/cli` (`cli-effect`) | rename + `--deep`/`--fix`/`--format agent` added |
| codegen `rule-registry.generated.ts` | hand-assembled `rules-registry-effect` aggregator | codegen replaced by a typed aggregator |

> **Note on the design docs:** the original target design (`docs/`) chose plain TS over Effect (legacy debt #4) and a 5-package layout. The Effect-TS rewrite reversed the "drop Effect" decision — Effect's `Scope`/`Effect`/`Schema` now carry the resource lifecycles, error channel, and wire contracts the design had assigned to hand-rolled `using`/`Result`/validators. The behaviour contract (BC-xx) is unchanged.

---

## 8. Deferred / forward path

- **Catalog expansion** — all four tiers (SYN/TYP/CFG/GRAPH) are proven and all 14 categories populated (95 rules); author the rest of the spec taxonomy against the existing seams.
- **ESLint flat-config adapter** (C15) · **GitHub Action** (C17) · **optional remote telemetry/leaderboard** (C19, behind the proven request caps).
- **Schema.TaggedError migration** — complete the signature-preserving move of `errors`/`security` tagged errors from `Data.TaggedError` to `Schema.TaggedError` where it stays compatible.
- **Rust/oxlint Tier-1 fast-path** if parse latency demands it (same `defineRule` interface).

---

*The 33-package Effect-TS rewrite proves the architecture end-to-end; the named pending work fills the broader catalog. Design history: `docs/`.*

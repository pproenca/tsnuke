# `@ts-fix/engine-effect` — Transformation Notes

THE integrating keystone of the ts-fix modernization: the two-tier `runEngine`
(RULE-018 + RULE-036 + RULE-013) and the `diagnose()` orchestration that wire ~12
finished strangler-fig slices into a working end-to-end analysis. This slice owns no rules
and no contracts — it is the impure execution **shell** + the public **boundary**.

Source of truth (READ-ONLY, never edited):
- `legacy/ts-fix/packages/core/src/engine.ts:64-326` — `runEngine`, the two-tier shell.
- `legacy/ts-fix/packages/core/src/index.ts:154-249` — `diagnose()` + `readSourceFiles`
  + `overridesFromConfig`.
- `legacy/ts-fix/packages/core/src/types.ts` — `DiagnoseOptions`/`DiagnoseResult`/`ScoreResult`.

---

## 1. Mapping table (legacy → target)

| Legacy (`packages/core/src/…`) | Target (`src/main/…`) | Notes |
|---|---|---|
| `engine.ts` `runEngine` (182-326) | `runEngine.ts` `runEngine` | Effect over `Scope`; Program lifecycle via `scale.scopedProgram`; rule execution stays plain sync. Logic ported VERBATIM. |
| `engine.ts` `buildProgramFromFiles` (129-163) | `runEngine.ts` `buildProgramFromFiles` | EXACT legacy CompilerOptions (`COMPILER_OPTIONS` const): target/module ESNext, moduleResolution Bundler, strict, noEmit, skipLibCheck. Virtual host serving in-memory files + default lib. Verbatim. |
| `engine.ts` `buildContext` (64-89) | *(reuses `rules-core.createRuleContext`)* | Legacy inlined `buildContext`; we REUSE rules-core's `createRuleContext` (the same substrate the proven rule slices use) instead of re-inlining — Brief directive. Byte-identical output (`createGraphRuleContext` likewise). |
| `engine.ts` `scriptKindFor`/`walk` (106-119) | `runEngine.ts` `scriptKindFor`/`walk` | Verbatim. |
| `engine.ts` `getPreEmitDiagnostics`→`typecheck:ok` (194-205) | `runEngine.ts` (in `Effect.gen`) | The single Program build's error-filtered `getPreEmitDiagnostics` IS the `typecheck:ok` signal (no separate probe). `effectiveCaps` reconciliation (add iff proven, else delete) verbatim. |
| `engine.ts` CFG emit / Tier-1 loop / Tier-2 loop / GRAPH pass (227-318) | `runEngine.ts` | Verbatim: CFG → one project-level diagnostic each at `configFilePath` line 1 (`meta.message ?? meta.recommendation ?? \`Enable ${id}.\``); Tier-1 per-file (reuse Program's SourceFile else `createSourceFile`); Tier-2 only when `plan.tier2Enabled`, single shared `getTypeChecker()`; GRAPH once over the set via `buildModuleGraph` + `shouldActivate`-active graph rules. |
| `engine.ts` re-exports `planEngineRun`/`SKIP_REASON_*` (39-46) | `runEngine.ts` re-exports (from `engine-plan-effect`) | Same public surface; sourced from the engine-plan slice. |
| `index.ts` `diagnose` (189-249) | `diagnose.ts` `diagnose` | `Effect<DiagnoseResult, TsFixError, FileSystem \| Path \| Scope>`. Same wiring order. |
| `index.ts` `readSourceFiles` (154-165) | `diagnose.ts` `readSourceFiles` | `node:fs readFileSync` → `@effect/platform FileSystem.readFileString`; per-file `try/catch` → `Effect.orElseSucceed(undefined)` (skip-not-fatal). `.ts`/`.tsx` extension filter preserved (`extnameOf` mirrors `node:path.extname`). |
| `index.ts` `overridesFromConfig` (168-176) | `diagnose.ts` `overridesFromConfig` (exported) | Pure; the `warn`→`warning` normalization preserved (RULE-040). |
| `types.ts` `ScoreResult` (53-61) | `types.ts` `ScoreResult` | LEGACY shape kept: `{ score, label, partial }`. See §2 (`band`→`label`). |
| `types.ts` `DiagnoseOptions`/`DiagnoseResult` | `types.ts` (same names) | `ProjectInfo` re-exported from `discovery-effect` (owned there), not re-declared. |
| `index.ts` `diagnose` is `async`/`Date.now()` | `node.ts` `diagnoseNode` | Prod runnable: `Effect.scoped` (bounds the Program's Scope, RULE-036) + `Effect.provide(NodeContext)` (NodeFileSystem + NodePath) → `Promise<DiagnoseResult>`. |

### Consumed slices (the ~12 `file:` deps, all wired)
`score/effect` (`computeScore`), `config/effect` (`loadConfig`), `discovery/effect`
(`discoverTsProject`, `computeCapabilities`, `collectSourceFiles`, `ProjectInfo`),
`scale/effect` (`scopedProgram`, `shouldSkipTier2ForMemory`,
`DEFAULT_TIER2_MEMORY_CEILING_BYTES`), `engine-plan/effect` (`planEngineRun`,
`SeverityOverrides`, `Severity`, skip reasons), `capabilities/effect` (`shouldActivate`),
`rules-registry/effect` (`ruleRegistry`, `graphRuleRegistry`), `rules-core/effect`
(`createRuleContext`, `createGraphRuleContext`, `Rule`, `GraphRule`), `module-graph/effect`
(`buildModuleGraph`), `filter-pipeline/effect` (`runFilterPipeline`, `DiagnosticWithTags`),
`contracts/effect` (`Diagnostic`, `Capability`, `TsFixConfig`, `RuleMeta`),
`errors/effect` (the tagged discovery errors, as the `diagnose` error channel).
`build-report/effect`'s `file:`-dep + `server.deps.inline` consumption pattern was the
template for wiring all of these (`vitest.config.ts` inlines the full transitive closure).

---

## 2. Deliberate deviations (all intentional; all proven safe)

1. **RULE-036 — Program disposal WIRED (the OOM cure legacy never ran).** Legacy
   `runEngine` built ONE `ts.Program` and **never disposed it** (confirmed defect,
   assessment Debt #2): memory pinned until GC, which on a monorepo loop is the OOM the
   dormant `scale.ts` helper was written to prevent. Here the Program is acquired via
   `scale.scopedProgram` (`Effect.acquireRelease`), so its reference is released when the
   surrounding `Scope` closes — on success, failure, AND interruption (a beneficial
   superset of legacy try/finally, inherited from the scale slice). `runEngine` therefore
   returns `Effect<EngineResult, never, Scope>`; `diagnoseNode` discharges the `Scope` with
   `Effect.scoped` so the Program is gone before each call resolves. **This changes
   lifecycle, not output** — proven by `equivalence.test.ts` (output identical to the
   never-disposing oracle).

2. **RULE-013 — memory-ceiling guard WIRED but INERT by default.** Legacy's guard was
   unwired dead code. It is now wired via `scale.shouldSkipTier2ForMemory`, fed an INJECTED
   `currentRssBytes` (default `0`, which can never trip the ceiling) so a default run is
   **byte-identical to legacy** (the equivalence proof runs with the guard inert). When an
   over-ceiling RSS is injected, Tier-2 is shed exactly like `tier2Enabled=false`: the
   engine forces the planner's `deep` to `false` for the gating decision (reusing the
   already-proven `planEngineRun` skip-accounting + `scorePartial`) and overrides the human
   reason to `SKIP_REASON_MEMORY` (distinct from NO_TYPECHECK/NO_DEEP — the project DID
   type-check; memory is why Tier-2 was shed). The RSS source lives at the prod edge
   (follow-up).

3. **`band` → `label` mapping (RULE-018 partial-honesty boundary).** The score slice
   returns `{ score, band }` (a typed `ScoreBand` literal), NOT legacy's `{ score, label:
   string }`. `diagnose` maps `band` → `label` and wraps the engine's `scorePartial` into
   `ScoreResult.partial`. **The score slice's `ScoreResult` stays partial-FREE** (scoring is
   a pure fact; partiality is an engine concern) — RULE-018: the same score scale is used
   whether or not Tier-2 ran; only the `partial` flag differs.

4. **`diagnose` is now an `Effect` over `FileSystem | Path | Scope`** (legacy was `async`).
   Discovery's typed errors (`TsconfigNotFoundError`/`NoTypeScriptProjectError`) flow on the
   ERROR CHANNEL (legacy `throw`); file reads go through `@effect/platform` (legacy
   `node:fs`/`node:path`); the Program lives in the ambient `Scope`. Config loading + the
   engine are total (error channel `never`). `elapsedMilliseconds` is the ONE
   non-deterministic field (wall-clock via `Effect.sync(() => Date.now())`) — it never feeds
   the score.

5. **Reuse rules-core's `createRuleContext`/`createGraphRuleContext`** instead of
   re-inlining legacy's `buildContext` — keeps the engine's per-file/graph contexts
   byte-identical to what the proven rule slices expect (Brief directive). The engine's
   parse-once-run-many loop is its OWN (it does NOT use rules-core's `runRule`, which
   re-parses per snippet).

### Non-deviation worth noting (faithful, not a change)
**`--no-deep` reports NO_TYPECHECK, not NO_DEEP, through `runEngine`.** With `deep:false`
the engine builds NO Program (`deep !== false && files.length > 0`), so `typecheck:ok` is
never PROVEN — the engine deletes any caller-supplied token (legacy `:202-205`, "refuses to
trust a caller-supplied `typecheck:ok`") and the planner records NO_TYPECHECK. This matches
legacy exactly (legacy `engine.test.ts:28-39` asserts only `scorePartial`+`skippedChecks`,
not the reason). The NO_DEEP branch (typecheck:ok present AND deep=false) is **unreachable
via `runEngine`** — it is a pure-planner branch, pinned directly on `planEngineRun` in
`runEngine.test.ts`.

---

## 3. What was NOT migrated (the surfaces — next phase)

- **Monorepo multi-project orchestration.** Legacy's higher-level loop that discovers N
  projects and runs `diagnose` per-project (and summarizes with the MIN score, RULE-003) is
  NOT here. This slice diagnoses ONE project.
- **`build-report` wiring.** `buildReport`/`serializeError` (the versioned JSON report) is a
  finished slice but is NOT called here — `diagnose` returns a `DiagnoseResult`, not a
  `JsonReportV1`. The report-assembly surface is the next phase.
- **CLI / MCP surfaces.** No command parsing, exit codes, agent formatting, or `explain`.
  Those call `diagnoseNode` and are out of scope for the keystone.
- **`format-agent` / `explain`.** Offline rendering surfaces — not the engine.

---

## 4. Follow-ups

1. **Monorepo loop reuses `scopedProgram` per-project.** The per-project `Effect.scoped`
   boundary `diagnoseNode` already uses is exactly the unit the monorepo loop should wrap —
   so no Program from project N survives into project N+1 (the RULE-036 OOM cure at scale).
   The `runEngine.test.ts` "re-running under fresh scopes" test pins this lifetime.
2. **CLI / MCP call `diagnoseNode`.** The prod runnable is the single integration point.
3. **The RULE-013 RSS source at the prod edge.** The memory guard is wired + tested but
   inert by default; the live `process.memoryUsage().rss` should be injected at the prod
   edge (CLI/MCP), with a host-tuned `ceilingBytes`, so the guard actually engages under
   monorepo memory pressure. `SKIP_REASON_MEMORY` is the user-facing reason it surfaces.
4. **`DiagnoseResult` → `JsonReportProjectEntry`.** When `build-report` is wired, map the
   `DiagnoseResult` (diagnostics/score/scorePartial/skippedChecks/elapsed) into a report
   entry; the shapes already align (build-report reads `unknown` for `project`).

---

## 5. Tests (33, all green) + the equivalence proof

`src/test/` — stub `FileSystem` Layer (`stubFs.ts`, copied from discovery's pattern) for
in-memory projects; `@effect/vitest` (`it.effect`/`it.scoped`) for the real Effects;
plain vitest for the prod-disk + pure-planner assertions.

- **`diagnose.test.ts` (7)** — end-to-end: clean → score 100 / Great / no diagnostics;
  SYN violations (`no-explicit-any`+`triple-equals`, `no-var`+`triple-equals`) fire + score
  drops; RULE-018 two-tier (type-checks → TYP `no-floating-promises` fires + `scorePartial=false`;
  type error → TYP skipped + NO_TYPECHECK + `scorePartial=true`; `--no-deep` → skipped +
  partial); discovery error channel (`TsconfigNotFoundError`).
- **`runEngine.test.ts` (11)** — CFG (one `enable-strict` at tsconfig line 1; self-disables
  with the strict token); GRAPH (`no-import-cycles`); cap reconciliation (engine deletes a
  caller-supplied `typecheck:ok` when no Program → NO_TYPECHECK) + the pure-planner NO_DEEP
  branch; RULE-036 (scoped Program released; independent re-runs; two runs in one scope both
  complete); RULE-013 (over-ceiling RSS → Tier-2 skipped + `SKIP_REASON_MEMORY` + partial;
  default inert → Tier-2 runs; under-ceiling → Tier-2 runs).
- **`cfgGraph.test.ts` (3)** — CFG/GRAPH through `diagnose` (loose tsconfig → `enable-strict`
  once at line 1; fully-strict → absent; mutual imports → `no-import-cycles`).
- **`node.test.ts` (3)** — `diagnoseNode` against REAL temp dirs: clean → 100; SYN violation
  → `no-explicit-any` + score drop; no-tsconfig → rejects `TsconfigNotFoundError`. Proves the
  prod NodeContext + `Effect.scoped` wiring.
- **`equivalence.test.ts` (9)** — modern `runEngine` === frozen vendored legacy oracle
  (`legacyEngineOracle.ts`, a verbatim copy of `engine.ts:64-326` fed the SAME proven modern
  `ruleRegistry`/`graphRuleRegistry`/`shouldActivate`/`buildModuleGraph`/
  `createGraphRuleContext`/`planEngineRun`), memory guard inert. Diagnostics deep-equal
  (sorted for stable compare) + skipped + reasons + `scorePartial`, over crafted file sets
  (clean / SYN / TYP / type-error / `--no-deep` / CFG / GRAPH / empty / mixed). This proves
  the execution-shell wiring matches legacy.

`./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/vitest run` are both green
(including a one-off `--noUnusedLocals --noUnusedParameters` pass). **35 tests** after the
architecture-review fixes below.

---

## 6. Architecture review (consolidated, `architecture-critic`)

**No HIGH/Blocker findings.** The critic independently diffed BOTH `runEngine` AND the vendored
oracle against legacy `engine.ts` (byte-faithful, not a shared-bug mirror), confirmed RULE-018
partial-honesty is exact (incl. the `typecheck:ok` delete-when-no-Program reconciliation and the
faithful `--no-deep`→NO_TYPECHECK-via-runEngine behavior), RULE-036 is a real `acquireRelease`,
RULE-013 is inert-by-default (so the equivalence proof is uncontaminated), and `diagnose` matches
legacy `index.ts` (order, `overridesFromConfig` warn→warning, `readSourceFiles`, inline-disable
`sources`, `band`→`label`, `elapsedMilliseconds` excluded from the score).

**Applied:**
- **M-1 — proved the engine's OWN RULE-036 finalizer fires.** The test claiming to verify the
  OOM-cure release was a no-op (`expect(true).toBe(true)`), leaning on the scale slice's proof.
  Added an `onProgramRelease` seam to `RunEngineOptions` (called in the scoped Program's release)
  + 3 real tests: finalizer fires EXACTLY ONCE per scoped deep run; two runs in one scope release
  twice; a `--no-deep` run (no Program) never releases. RULE-036 — the rewrite's headline cure —
  is now demonstrably exercised, not asserted-by-tautology.
- **M-2 — made the RULE-013 reason relabel defensive.** Under memory pressure the relabel now
  rewrites ONLY skips carrying the planner's `SKIP_REASON_NO_DEEP` (the memory-forced ones) to
  `SKIP_REASON_MEMORY`, instead of blindly relabelling every skipped id — so a future change that
  skipped a TYP rule for a different reason while memory pressure also held could not be silently
  mislabelled MEMORY. Behaviour unchanged today (proven by the green RULE-013 + equivalence tests).

**Recorded, no change:**
- **M-3 — the equivalence proof feeds both sides rules-core's `createRuleContext`** (not legacy's
  inline `...input`-spread `buildContext`), so it can't independently catch a context-substrate
  divergence. The critic confirmed they are behaviorally identical for the actual catalog (no rule
  overrides `rule`/`tier`/`category`/`severity` via `report` or emits `undefined` optionals); the
  `createRuleContext` substrate is proven against legacy in the rules-core slice. Acceptable; flagged.
- **N-1** `extnameOf` re-implements `node:path.extname` (proven equivalent) though `Path.Path` is in
  scope — minor; **N-4** the RULE-013 guard checks AFTER `buildProgramFromFiles` (faithful single-call
  limitation) — the MONOREPO follow-up must check the guard BEFORE `scopedProgram` per project.

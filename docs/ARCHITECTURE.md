# Reimagined Architecture — `ts-doctor`

*Phase C of `/modernize-reimagine`. Target design for the TypeScript-equivalent of react-doctor. Generated 2026-05-24. Reviewed by `architecture-critic` (§9).*

Inputs: `AI_NATIVE_SPEC.md` (capabilities C1–C20, behavior contract BC-01…BC-24, Phase-B decisions §6). Scope reflects the recorded decisions: **P0 = C1–C10, C13, C14, C16**; Tier-2 type-aware = seam + stub; remote score **dropped**; ESLint adapter + GitHub Action **deferred**; scoring model kept, weights re-tuned for TS.

---

## 1. Design principles (what makes this a reimagine)

1. **One AST substrate, two tiers — one parse, one type-check.** Use the **in-process TypeScript compiler API** (`typescript`) as the single analysis substrate — not oxlint, and **not** a `tsgo`/`tsgolint` subprocess (that option is removed from the v1 contract; revisit only as a future fast-path). The substrate is built **once per project**: `ts.createProgram` over the resolved tsconfig file set. The result of `program.getPreEmitDiagnostics()` (semantic + syntactic) **is** the `typecheck:ok` signal — there is no separate probe build. On the healthy path the Program's already-parsed `SourceFile`s serve **both** tiers (one parse): Tier-1 (SYN/GRAPH/CFG) walks them without the checker; Tier-2 (TYP) walks the same ASTs with `program.getTypeChecker()`. Only on the **broken-project path** (Program won't build / type-check fails) does Tier-1 fall back to standalone per-file `ts.createSourceFile` parses — resilient, always available, and the *only* place a second parse strategy exists. This dissolves react-doctor's type-unaware limitation at the substrate level without ever type-checking or parsing twice on the common path. *(Incorporates critic B1, M2.)*
2. **Local, deterministic, offline.** No network in the hot path. The score is computed in-process from the diagnostic set. Same inputs → identical diagnostics, identity strings, and score. This is the property an agent loop (`while score < target: fix && rescan`) depends on.
3. **Agent-first output.** Structured machine-applicable fixes and rule-deduplicated, fix-sorted output are P0, not an afterthought. The deterministic diagnostic identity is the stable contract an agent references across runs.
4. **Carry the proven mechanism, rebuild the domain.** The registry codegen, capability-gated activation predicate, filter pipeline, diagnostic identity, scoring math, versioned report, and every security guard transfer from react-doctor (verified domain-agnostic). Only detection logic + the token vocabulary + project discovery are rewritten.
5. **Lighter dependency surface than legacy.** Drop Effect (react-doctor's beta-pinned debt #4) in favor of plain TypeScript with tagged-error classes and a small `Result` type + explicit dependency injection. This removes a pre-release runtime dependency — but it does **not** remove the resource-lifecycle work Effect was doing; it moves it onto us. The disposal of three resources must be hand-managed via a `using`/`Symbol.dispose` convention (TS 5.2+): the `ts.Program` (pins memory until dropped — critical on the monorepo loop, §4.3), temp files (the atomic-private-write pattern, BC carried), and git subprocesses (kill-on-timeout). One `Disposable` helper covers all three. *(Incorporates critic m1.)*
6. **No custom plugin loading in v1 — BC-18 satisfied by construction.** react-doctor's #1 security finding is the CWE-94 RCE from auto-`require`-ing plugins declared in a *scanned* repo's config. There is nothing to "carry" here — the legacy behavior *is* the vulnerability. v1 ships a **first-party catalog only**: `tsdoctor.config.json#plugins` is **ignored** (warned, never executed). This removes the entire RCE class by construction. If third-party plugins are ever wanted, they must be bare npm names resolved from the *tool's own* `node_modules` behind an explicit `--allow-plugins` flag — never from the scanned repo. *(Incorporates critic B2.)*

---

## 2. C4 Container diagram

```mermaid
C4Container
    title ts-doctor — Target Architecture (v1 reimagine)

    Person(dev, "TypeScript Developer", "Runs the CLI locally; reads diagnostics, applies --fix")
    System_Ext(agent, "Coding Agent", "Claude Code / Cursor — primary consumer; reads agent-format output, applies structured fixes, loops on score")
    System_Ext(ci, "CI Runner", "Runs the CLI on PRs (GH Action deferred; raw CLI for now)")
    System_Ext(scanned, "Scanned Repo", "Untrusted TS source + tsdoctor.config.json + tsconfig.json")

    Container_Boundary(npm, "ts-doctor (pnpm monorepo)") {
        Container(cli, "CLI — `ts-doctor`", "TS / Node >=22", "[SCAFFOLD] inspect/install; diff/staged/full modes; --fix; --json; --format agent; --fail-on gate; --explain")
        Container(core, "Diagnostic Core — `@ts-doctor/core`", "TS", "[SCAFFOLD] discovery, capability computation, two-tier engine orchestration, filter pipeline, LOCAL score, report builder, security services (git/staged/glob)")
        Container(engine, "Rule Engine — `ts-doctor-rules`", "TS / ts compiler API", "[SCAFFOLD] codegen rule registry; defineRule visitor model; Tier-1 SYN/GRAPH/CFG rule bodies; Tier-2 TYP rule defs (stubbed)")
        Container(api, "Programmatic API — `@ts-doctor/api`", "TS", "[DEFERRED] thin diagnose() wrapper over core")
        ContainerDb(report, "JSON Report (schema v1)", "TS types + runtime validator", "versioned single-arm union; consumed by agents/CI")
    }

    System_Ext(tsc, "TypeScript compiler API", "ts.Program / SourceFile / TypeChecker — the single AST substrate")
    System_Ext(git, "git CLI", "Subprocess; array-arg, ref-name guarded, read-only")
    System_Boundary(deferred, "Deferred surfaces") {
        Container(eslint, "ESLint adapter", "TS", "[DEFERRED — C15]")
        Container(action, "GitHub Action", "composite", "[DEFERRED — C17]")
        Container(remote, "Remote score / leaderboard", "—", "[DROPPED v1 — C19]")
    }

    Rel(dev, cli, "runs")
    Rel(agent, cli, "runs (--format agent), applies fixes, loops on score")
    Rel(ci, cli, "runs")
    Rel(cli, core, "orchestrates diagnose")
    Rel(api, core, "wraps")
    Rel(core, engine, "loads registry, runs visitors")
    Rel(engine, tsc, "parses (Tier-1) / type-checks (Tier-2)")
    Rel(core, git, "spawns (guarded)")
    Rel(core, scanned, "reads source + config + tsconfig")
    Rel(core, report, "emits")
    Rel(cli, report, "renders / writes")
```

---

## 3. Service boundaries & rationale

Three packages are **scaffolded** (Phase E cap = 3); one is **deferred**. Boundaries follow react-doctor's proven decomposition (engine / core / consumer) minus the website.

### 3.1 `ts-doctor-rules` (Rule Engine) — *scaffold*
**Owns:** the rule catalog and the activation substrate. Houses: `defineRule` visitor model; the codegen rule registry (directory = category, file = rule; `gen:check` fails on missing metadata / unknown bucket — BC carried from C20); all Tier-1 **SYN** rule bodies (Type Assertions, Naming, Dead-code-syntactic, syntactic Security); **GRAPH** rule bodies (cycles, unused exports — over the module graph core provides); **CFG** rule bodies (strictness-gap rules reading tsconfig); and Tier-2 **TYP** rule *definitions* registered with metadata + `tier:"TYP"` but with `create()` bodies that emit nothing and are marked pending (BC-03/BC-10 seam).
**Entities:** `Rule`, `Preset`, `Category`, the capability-gating predicate (pure, over a token `Set<string>`).
**Why separate:** mirrors `oxlint-plugin-react-doctor` — the catalog evolves fastest and must be independently testable; the registry codegen is a build-time concern isolated here.
**Depends on:** `typescript` (AST types), leaf otherwise.

### 3.2 `@ts-doctor/core` (Diagnostic Core) — *scaffold*
**Owns:** everything between "a directory" and "a report." Project discovery (`discover-ts-project`: tsconfig resolution through `extends`, project-kind classification, TS version, module system, build-tool detection — C1); capability computation incl. the `typecheck:ok` probe (C2, BC-07); the **two-tier engine orchestrator** (Tier-1 always; Tier-2 only under `typecheck:ok`, building one shared `ts.Program` and reusing the checker across TYP rules — C4); the **module graph** builder (feeds GRAPH rules); the **filter pipeline** (auto-suppress → severity → ignore → inline-disable — C6, BC-11); **local scoring** (C7, BC-01/02/03); the **report builder** (C9, BC-23, monorepo worst-project min BC-05); and the **security services** (`git` with `isSafeGitRevision` BC-15; `staged-files` with Zip-Slip defense BC-16; `match-glob-pattern` ReDoS caps BC-17; sanitized subprocess env BC-19; hardened plugin trust boundary BC-18). Owns the `Diagnostic`/`Fix`/`Report`/`ProjectInfo`/`Config` types.
**Why separate:** the same split react-doctor uses (`@react-doctor/core`); the orchestration + services are the stable, security-critical heart and must not depend on CLI concerns.
**Module graph:** built via **`ts.resolveModuleName`** with the parsed `CompilerOptions` (honors `paths`/`baseUrl`/`exports`/`extends`) — not import-string scraping; GRAPH rules consume it (§4.1).
**Public boundary:** core exports the exact `DiagnoseResult` shape from `AI_NATIVE_SPEC.md §3.2` **today**, so the deferred `@ts-doctor/api` is later a literal re-export, not a redesign (avoids designing the surface twice — critic m5).
**Depends on:** `ts-doctor-rules`, `typescript`, `git` (subprocess).

### 3.3 `ts-doctor` (CLI) — *scaffold*
**Owns:** the published binary (C10). Commands `inspect` (default) + `install`; flags/modes (diff/staged/full, `--json`/`--json-compact`, `--score`, `--deep`/`--no-deep`, `--fail-on`, `--annotations`, `--pr-comment`, `--explain`/`--why`, `--respect-inline-disables`); the **`--fix` applier** (C13 — applies `Fix.edits` as non-overlapping descending char-offset splices; on overlap, apply first + drop conflicts this pass, converge in ≤2 passes); the **agent output formatter** (C14 — `--format agent`: rule-deduplicated, tier+fixKind sorted, category-grouped, path-stripped); exit-code gate (BC-21); renderers; `install` (skill C18 + git hooks). **`--explain`/`--why` is fully offline/deterministic** — it renders the static `rule.recommendation` / `help` / (for TYP) `inferredType` from rule metadata; **no model call in v1** (the "AI-native" value is structured metadata an agent consumes, not an in-tool LLM round-trip). *(critic m2, m3.)*
**Why separate:** consumer of core; the place all human/agent-facing presentation lives.
**Depends on:** `@ts-doctor/core`, `ts-doctor-rules` (for `--explain` rule metadata).

### 3.4 `@ts-doctor/api` (Programmatic API) — *deferred*
A thin `diagnose(dir, opts) → DiagnoseResult` wrapper (C12). Deferred because it is a trivial projection of core's public function once core stabilizes; scaffolding it now would duplicate a moving surface.

---

## 4. The two-tier engine (the central design)

### 4.1 Single Program build — the type-check IS the capability probe

The critic's B1 was decisive: a separate `typecheck:ok` probe would type-check the project, then Tier-2 would type-check it *again*, and Tier-1's standalone parse would re-parse every file a *third* time. The corrected design builds the substrate exactly once and derives everything from it.

```
   directory ──► discover-ts-project ──► ProjectInfo ──► capabilities (Set<string>, sans typecheck:ok yet)
                         │
                         ▼
              activate(rules, caps)            (decides which SYN/GRAPH/CFG/TYP rules are in scope)
                         │
                         ▼
        ┌──── try: ts.createProgram(tsconfig fileset)  [ONE build] ────┐
        │                                                              │
   build fails / OOM                                          program.getPreEmitDiagnostics()
        │                                                         (semantic+syntactic)
        ▼                                                              │
  BROKEN-PROJECT PATH                                       ┌──────────┴──────────┐
  per-file ts.createSourceFile                          clean?                 not clean?
  → Tier-1 only (SYN/CFG; GRAPH                            │ YES                  │ NO
    via resolveModuleName)                          typecheck:ok ✔         typecheck:ok ✗
  Tier-2 SKIPPED, scorePartial=true                        │                     │
        │                                    ┌─────────────┴───────┐   (optionally surface
        │                                    ▼                     ▼    tsc errors as diags)
        │                          TIER-1 over Program's    TIER-2 over same
        │                          parsed SourceFiles       Program + getTypeChecker()
        │                          (no checker)             reuse checker across TYP rules
        │                                    │                     │   Tier-2 SKIPPED if not clean,
        │                                    └──────────┬──────────┘   scorePartial=true
        └──────────────────────────────────────────────┤
                                                        ▼
                              Diagnostic[] (each tagged tier)
                                          │
                              filter pipeline (4 ordered stages, BC-11)
                                          │
                              local score + report + fixes
```

- **One parse, one type-check on the healthy path.** When the Program builds, `program.getSourceFile()` gives Tier-1 its ASTs for free — Tier-1 and Tier-2 walk the *same* parsed sources. The standalone `ts.createSourceFile` parse exists **only** on the broken-project path. *(critic B1, M2)*
- **`typecheck:ok` is a result, not a pre-step.** `getPreEmitDiagnostics()` filtered to semantic/syntactic errors *is* the signal. No second build.
- **GRAPH correctness.** Module-graph rules (cycles, unused exports) use **`ts.resolveModuleName`** with the parsed `CompilerOptions` (honoring `paths`/`baseUrl`/`exports`/`extends`), not raw import-string scraping. **`no-unused-exports` is reclassified to the `typecheck:ok` path** — it cannot be computed correctly without resolving every importer. *(critic M2)*
- **Honesty (BC-03).** Tier-2 skipped (broken project OR `--no-deep`) → every TYP rule records a `skippedCheckReason`, `scorePartial=true`, score labeled a *different scale* (see §5). `--deep`/`--no-deep` force/skip Tier-2.

### 4.2 Scale model — re-derived for the in-process substrate

The legacy batch + binary-split (BC-24) recovered from an **oxlint subprocess**'s argv-length cap and per-spawn OOM. With an in-process Program there is no argv cap, and you don't feed files in batches — so binary-splitting the input list is a **no-op against the real failure mode**, which is now **Program memory**. *(critic M3)*

The real levers for v1:
- **Per-project Program, built and disposed sequentially** (§4.3) — never hold N Programs resident.
- **Builder/incremental program reuse** within a watch/loop session where available.
- **Diff/staged mode:** still build the Program (cross-file type info requires it) but **report only on the include set** — bounds output, not the type-check.
- **Memory ceiling → graceful degrade:** if the Program won't fit, skip Tier-2 with `scorePartial=true` rather than crash.
- BC-24's binary-split is retained **only** if a `tsgolint` subprocess path is ever reintroduced (§8); it is not part of the in-process v1.

### 4.3 Monorepo model

C1 resolves `tsconfig.json` through `extends` and classifies `monorepo`. A monorepo has many tsconfigs. v1 treats **each workspace tsconfig independently** (simpler than solution-style `ts.createSolutionBuilder`; revisit if project-references demand it): for each workspace, build → analyze → **dispose** its Program before the next, accumulating diagnostics. Never N Programs resident at once (this is also the memory fix for §4.2). **BC-05 summary score = `min` over per-project scores**; a project whose Program failed contributes a partial score, and **the summary `scorePartial` is true if *any* project is partial.** *(critic M4)*

---

## 5. Scoring — model kept, weights frozen (critic M1 reversal)

The Phase-B decision was "keep the model, re-tune weights for TS." The critic (M1) showed a tier-weighted, config-tunable matrix actively breaks the property the score exists for, so the **incorporated** v1 design is more conservative:

- **Two frozen weights, not five.** Penalty per distinct fired rule: **error = 1.5, warning = 0.75** — react-doctor's proven pair. The *catalog's own tier mix* does the de-facto weighting (TYP rules skew toward `error`, CFG toward light `warning`), so a five-bucket matrix is unnecessary and uncalibratable without a corpus. Tier-weighting is revisited post-v1 *with* a corpus.
- **Weights are frozen constants in code, versioned with the schema — NOT user config.** Config-tunable weights would make two machines compute different scores for identical code, destroying the cross-machine comparability the score is *for*. (The legacy debt being fixed — #7 hardcoded *endpoint* — is about network endpoints, not scoring constants; do not over-correct onto the weights.)
- **Two scales, one honesty mechanism.** Crossing the `typecheck:ok` boundary changes which rules are *in scope* (TYP rules appear), so a full score and a partial score are **different scales** — fixing an unrelated type error can legitimately bring TYP rules into scope and move the score. This is the *same* hazard BC-03 already flags: `scorePartial=true` means "different scale, not comparable to a full score." An agent loop must compare only same-scale scores.

```
score = max(0, round(100 − (distinctErrorRules × 1.5 + distinctWarningRules × 0.75)))
empty diagnostics → 100 ; bands: ≥75 "Great" / ≥50 "Needs work" / else "Critical"
```

**Determinism preserved** (no network, no clock, no config-dependent weights). *(Incorporates critic M1.)*

---

## 6. Technology choices

| Choice | Decision | One-line justification |
|---|---|---|
| Language / runtime | strict ESM TypeScript, Node ≥22 | carry the proven legacy baseline |
| AST substrate | **in-process `typescript` compiler API** (no subprocess) | one substrate, one parse, one type-check for both tiers; removes oxlint's type-unaware ceiling (§1.1, §4.1) |
| Core composition | **plain TS + tagged errors + small `Result` + `using` disposal** (no Effect) | kills legacy debt #4 (beta-pinned Effect); the `Disposable` helper covers Program/temp-files/subprocess lifecycles Effect used to manage (§1.5) |
| Monorepo | **pnpm workspaces + turbo** | carry legacy tooling — proven, low-risk |
| Build | **tsup** (per package) | fast ESM+d.ts builds; simpler than legacy's vite-plus |
| Tests | **vitest** | fast, ESM-native; fixtures-per-rule like legacy |
| Rule registry | **codegen Node script** (carry) | directory=category, file=rule; `gen:check` fails on missing metadata |
| Fix application | **structured text edits** (`range = [startOffset, endOffset)` char offsets + `replacement`; apply non-overlapping descending, drop conflicts this pass, converge in ≤2 passes) | language-neutral, agent-applicable; ts-morph reserved for codemods later (§3.3, critic m2) |
| Agent surface (v1) | **`--format agent` + `SKILL.md`** | meets C14/C18 now; **MCP server** noted as the stronger AI-native surface for a fast-follow (§8) |
| Validation | **runtime schema validator** (zod or hand-rolled) for report + config + optional score wire | replace Effect Schema with a lighter validator; keep the versioned single-arm union (BC-23) |

---

## 7. Data migration

ts-doctor is **greenfield adoption, not a data migration** — react-doctor has no databases. The only "stores" and their treatment:

| Legacy store | Treatment |
|---|---|
| `react-doctor.config.json` / `package.json#reactDoctor` | New format `tsdoctor.config.json` / `package.json#tsDoctor`; **no migration** (different tool, different rules). Same lenient-validation contract (BC-22). |
| JSON report (`schemaVersion:1`) | Fresh `schemaVersion:1` for ts-doctor; consumers re-integrate. Same forward-compat single-arm-union design. |
| Diagnostic identity / baselines / suppress files | Identity **scheme** kept (`filePath::line:column::plugin/rule`) so the baseline mechanism is portable; concrete ids differ (TS rules), so existing react-doctor baselines do not carry — expected for a different tool. **Note:** identity is stable across *non-mutating* re-scans; `--fix` shifts line:column and **invalidates positional identities by design** — an agent must not assume cross-fix identity stability (critic m4). |
| Remote score / leaderboard DB | **Dropped (C19).** No migration. |

No schema-conversion, backfill, or dual-write phase is required.

---

## 8. Forward path (post-v1, out of scope for the scaffold)

- **MCP server** as a first-class agent surface (stronger than a skill file): expose `diagnose`, `explain`, `apply_fix` as tools. The agent-format output (C14) is the payload; this is the most AI-native delivery and the recommended fast-follow.
- **Tier-2 real implementation** — wire the `ts.Program` + checker into the TYP `create()` bodies behind the seam scaffolded in v1.
- **`@ts-doctor/api`**, **ESLint adapter (C15)**, **GitHub Action (C17)** — deferred surfaces.
- **Rust/oxlint Tier-1 fast-path** if parse latency demands it.
- **Optional remote telemetry** (C19) — only if a leaderboard is wanted, behind the proven request caps (BC-20).

---

## 9. Architecture-critic review & incorporated changes

An adversarial `architecture-critic` pass reviewed this design against the spec. Two blockers, four majors, six minors. **All were incorporated** (the design above is the post-review version):

| Finding | Severity | Incorporated as |
|---|---|---|
| **B1** — `typecheck:ok` probe type-checks + parses twice on the healthy path | blocker | §1.1, §4.1 — single Program build; `getPreEmitDiagnostics()` *is* the signal; one parse serves both tiers; standalone parse only on broken-project path |
| **B2** — BC-18 plugin trust boundary named but never designed (the #1 RCE) | blocker | §1.6 — **no custom plugin loading in v1**; scanned-repo `plugins` ignored; RCE class removed by construction |
| **M1** — tier-weighted config scoring breaks cross-machine comparability | major | §5 — collapsed to two **frozen** weights (1.5/0.75) in code, not config; tier mix does de-facto weighting; scale-change honesty unified with BC-03 |
| **M2** — per-file parse not cheaper on healthy path; GRAPH overclaimed | major | §4.1 — Program's parsed sources serve Tier-1 on healthy path; GRAPH uses `ts.resolveModuleName`; `no-unused-exports` → `typecheck:ok` path |
| **M3** — legacy batch/binary-split is a no-op vs in-process Program | major | §4.2 — re-derived scale model (per-project Program, sequential dispose, diff-bounded reporting, memory-ceiling graceful degrade); BC-24 retained only for a future subprocess path |
| **M4** — monorepo one-Program model under-specified | major | §4.3 — per-workspace tsconfig, sequential build→analyze→dispose, never N resident; BC-05 `min`; summary `scorePartial` if any project partial |
| **m1** — Effect drop moves resource-lifecycle work onto us | minor | §1.5 — `using`/`Symbol.dispose` `Disposable` helper covering Program/temp-files/subprocesses |
| **m2** — fix offsets/overlap undefined | minor | §3.3, §6 — `range = [startOffset,endOffset)` char offsets; non-overlapping descending, drop conflicts, ≤2-pass convergence |
| **m3** — `--explain` "natural-language" risked an LLM call | minor | §3.3 — renders static metadata only; offline/deterministic; no model call in v1 |
| **m4** — identity oversold as cross-run stable | minor | §7 — note: stable across non-mutating rescans; `--fix` invalidates positional identity by design |
| **m5** — `@ts-doctor/api` surface designed twice | minor | §3.2 — core exports the exact `DiagnoseResult` now; api is a later re-export |
| **m6** — §9 empty but header claimed review | minor | this table |

**Affirmed by the critic as correct — frozen, not to be re-litigated:** the two-tier engine concept; local/deterministic/offline scoring + dropping C19; partial-score honesty as a first-class fail-safe; carrying the domain-agnostic security guards verbatim (BC-15/16/17/19); the filter-pipeline order + identity scheme (BC-11/13); three packages (engine/core/CLI) with API deferred and no website; text-edit fixes over ts-morph for v1; codegen registry with `gen:check` failing on missing metadata; MCP server kept out of v1 as a fast-follow.

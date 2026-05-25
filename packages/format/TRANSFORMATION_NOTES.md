# `@ts-doctor/format-effect` — Transformation Notes

Effect-TS strangler-fig slice for ts-doctor's **output formatters**: the three PURE
formatting functions that turn structural inputs (diagnostics, a score summary, a rule
registry) into the strings/objects the CLI and MCP server emit. All three are plain pure
functions — **NOT Effect-wrapped** — because they do no IO (just string/object assembly).

## Scope

| Legacy source | Symbols | Target file |
|---|---|---|
| `legacy/.../packages/core/src/format-agent.ts` (170 lines) | `formatAgentReport`, `AgentOccurrence`, `AgentRuleEntry`, `AgentCategoryGroup`, `AgentReport` | `src/main/format-agent.ts` |
| `legacy/.../packages/ts-doctor/src/render.ts` (69 lines) | `renderScoreLine`, `renderPretty` | `src/main/render.ts` |
| `legacy/.../packages/core/src/explain.ts` (78 lines) | `asRuleLookup`, `explain`, `explainDiagnostic`, `RuleLookup`, `ExplainContext` | `src/main/explain.ts` |
| `legacy/.../packages/ts-doctor/src/explain.ts` (7 lines) | thin re-export wrapper | folded into the barrel `src/main/index.ts` |

Public barrel (`src/main/index.ts`): `formatAgentReport` + `Agent*` types (incl. the new
local `AgentScoreInput`), `renderScoreLine`/`renderPretty` + `RenderScoreResult`,
`asRuleLookup`/`explain`/`explainDiagnostic` + `RuleLookup`/`ExplainContext`. **No
contracts symbols are re-exported** — `Diagnostic`/`RuleMeta` stay owned by
`@ts-doctor/contracts-effect`.

## Business rule covered

- **RULE-032 — fix-kind taxonomy & agent action ordering.** `formatAgentReport` sorts
  deduplicated rule entries cheapest-action-first: `tierOrder` (SYN 0 → TYP 1 → GRAPH 2 →
  CFG 3) then `fixKindOrder` (`auto-fix` 0 < `codemod` 1 < `manual` 2), tie-broken by
  `rule.localeCompare`. A diagnostic with **no fix** defaults its agent `fixKind` to
  `"manual"` (`d.fix?.kind ?? "manual"`). Preserved EXACTLY. (RULE-032's `--fix` collection
  half — only `auto-fix` edits are mechanically applied — lives in the fix-applier, not here;
  this slice owns only the report ORDERING half.)

## Deviations from legacy (all plumbing, NOT behavior)

1. **Consumes `@ts-doctor/contracts-effect`** for `Diagnostic` / `RuleMeta` / `FixKind` /
   `Tier` (`file:` dep), instead of legacy `@ts-doctor/rules`. The canonical contracts
   Schema types are a faithful structural match of the legacy `@ts-doctor/rules` types
   (`Severity`/`Tier`/`FixKind` literal unions, `Diagnostic`/`RuleMeta` shapes), so the
   ported functions type-check and behave identically. Nothing is re-vendored.

2. **`render` keeps the LEGACY structural `ScoreResult` shape** `{ score; label; partial }`
   (legacy `core/types.ts`) as its input — exposed here as the local `RenderScoreResult`
   interface. The modern score slice (`@ts-doctor/score-effect`) renamed the band field to
   `band`; **render does not depend on the engine/score slices** — it is a pure consumer of
   a structural input, and the **CLI maps the engine's `band` → `label`** when building this
   input. `renderScoreLine` reads only `.score` and `.label`; the `partial` flag arrives via
   the separate `scorePartial` boolean param exactly as in the legacy signature (so
   `score.partial` is unused by the renderer — verified by a test). Output strings (score
   line, the `  file:line:col  severity  rule  message` finding line, the `N error(s),
   M warning(s).` summary, the partial suffix) are preserved **byte-for-byte**.

3. **`formatAgentReport`'s score param** was legacy `Pick<ScoreResult, "score" | "label">
   | null`; since this slice does not depend on the score/engine slices, the `{ score, label
   }` structural shape is inlined as the local `AgentScoreInput` type. Sort/grouping logic is
   unchanged.

4. **`asRuleLookup` stays GENERIC** over a plain `Readonly<Record<string, RuleMeta>>` (the
   rule-registry shape) — it does **not** depend on the `rules-registry` slice, matching the
   legacy contract.

5. **Pure functions, NOT Effect-wrapped.** No `Effect`, no `Schema.decode` on the hot path —
   these are pure string/object formatters (per the architecture-critic's "kept pure & fast"
   caveat). `effect` appears only as a transitive type dependency of the contracts Schema types.

## Equivalence proof (TDD — characterization tests first)

`./node_modules/.bin/tsc --noEmit` → clean. `./node_modules/.bin/vitest run` → **35 tests, 3
files, all green.**

- **Ported legacy vectors (the equivalence baseline):**
  - `format-agent.test.ts` — all 5 legacy `format-agent.test.ts` cases ported verbatim
    (dedup → 3 occurrences; tier-then-fixKind sort; category grouping alphabetical;
    repo-root stripping; determinism).
  - `explain.test.ts` — all 4 legacy `explain.test.ts` cases ported verbatim (known-rule
    metadata; determinism; unknown-rule message; `explainDiagnostic` help + inferredType).
  - `render.ts` had **no legacy test file** (it is the deliberately-under-tested human
    surface). Fresh characterization tests were written from the legacy source.

- **Added per the task:**
  - RULE-032 ordering: a mix of auto-fix / codemod / manual + **no-fix** sorts correctly;
    no-fix defaults to `manual`; tier dominates fixKind; url present/absent; null score.
  - `renderScoreLine` for each band (Great / Needs work / Critical) + the partial suffix +
    the n/a path + the "param not field" distinction.
  - `explain` for a known rule (full VERBATIM block) + an unknown rule id (VERBATIM message)
    + header-only rule + the `Object.prototype` non-own-key guard.

- **Equivalence vs frozen legacy copies (`src/test/legacy-frozen.ts`):** byte-frozen,
  self-contained copies of the three legacy functions serve as the oracle. Crafted inputs
  exercising dedup, all fix kinds, every tier, multiple categories, repo-root stripping,
  occurrence sort, all score bands, and showScore/partial toggles are asserted to
  **deep-equal / string-equal** the oracle output. (`format-agent`: deep-equal + JSON
  byte-equal; `render`: full Cartesian product of score × partial × showScore × empty/populated
  string-equal; `explain`: known/unknown/context/diagnostic string-equal.)

## Scaffolding

- `package.json` `@ts-doctor/format-effect` — deps `@ts-doctor/contracts-effect` (`file:`) +
  `effect`; devDeps `typescript`, `vitest`, `@types/node`. `exports: "./src/main/index.ts"`.
- `vitest.config.ts` — `server.deps.inline: ["@ts-doctor/contracts-effect"]` so Vitest's
  esbuild compiles the `.ts`-entry `file:` dep at test time (the established slice pattern).
- `tsconfig.json` — copied verbatim from the score/build-report slices (strict,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, bundler resolution).
- `pnpm-workspace.yaml` — `allowBuilds: esbuild` (vitest needs the esbuild binary).
- `pnpm install` succeeded; the contracts `file:` import resolved and works under both tsc
  and vitest.

## Follow-ups (out of scope for this slice)

- The **CLI** wires these formatters to the engine's `DiagnoseResult` and picks the output
  per `--format pretty|json|agent`: it maps the engine's score result into render's structural
  `{ score, label, partial }` input (`band` → `label`) and into `formatAgentReport`'s
  `{ score, label }`. The `--json` surface (versioned report) is a separate slice
  (`@ts-doctor/build-report-effect`).
- The **MCP server** consumes `explain` / `explainDiagnostic` for its offline `--explain`/
  `--why` tool, and `formatAgentReport` for the agent projection.
- `asRuleLookup` will be fed the real rule registry from the `rules-registry` slice (kept
  generic here so that wiring is mechanical).

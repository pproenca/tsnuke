# Changelog

All notable changes to `tsnuke` are listed here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project follows
[SemVer](https://semver.org/spec/v2.0.0.html).

## [0.6.0] — 2026-05-27

Major agent-interaction overhaul. Driven by a real-world failure mode observed
in a Claude Code session against `maddie-native/apps/web` (May 27): the agent
spent ~20 minutes confused by "Score: 84/100 — Great" labelled on a partial
measurement, re-rationalizing the same framework false-positives every session,
and never running a meaningful `--fix` because every rule reported as `manual`.

This release closes the gap to react-doctor's agent UX while keeping tsnuke's
local-deterministic-offline core, building on patterns react-doctor already
proved work.

### Added
- **`prompts/agent.md` — the canonical agent playbook** (5-step loop: scan →
  filter → triage → fix → validate). Inlined into `SKILL.md` via
  `playbook.const.ts` for offline operation; the live URL
  `https://pproenca.dev/tsnuke/prompts/agent.md` is the deploy target so the
  playbook can iterate without npm releases. The `playbook.sync.test.ts`
  companion test pins the constant to the source-of-truth markdown.
- **`prompts/rules/<rule>.md` — 24 per-rule canonical prompts** with the
  two-section `## Validation prompt` + `## Fix prompt` shape (react-doctor
  pattern). Covers every high-volume rule from the maddie session:
  `explicit-module-boundary-types`, `no-unused-exports`, `no-unsafe-object-assertion`,
  `require-await`, `no-default-export`, `no-non-null-assertion`,
  `no-record-string-unknown`, `no-floating-promises`, `no-explicit-any`,
  `no-unsafe-call`, `consistent-type-definitions`, `triple-equals`, `no-var`,
  `prefer-satisfies-over-as`, `no-await-in-loop`, `prefer-array-methods`,
  `no-cast-in-return`, `no-double-assertion`, `no-unknown-return`,
  `no-assertion-on-json-parse`, `prefer-const-ternary`, `no-unsafe-member-access`,
  `switch-exhaustiveness-check`, `only-throw-error`.
- **`FRAMEWORK_SUPPRESSIONS` — built-in framework-aware false-positive
  catalog** (`@tsnuke/filter-pipeline-effect`). Drops the conventional FPs an
  agent would otherwise rationalize away every session: Next.js App Router
  conventions (`page.tsx` / `layout.tsx` / `route.ts` / `middleware.ts` +
  Pages Router), Storybook stories, Vite/Vitest/Playwright configs, test files
  (`*.test.ts` / `*.spec.ts` / `__tests__/**`), barrel files. 24 entries
  derived from the maddie session.
- **`.tsnuke/false-positives.md` — project-local FP store**. Mirror of
  react-doctor's format (`<rule>: <fileGlob> # reason`). Read by the engine
  via the new `loadFalsePositives` Effect (`@tsnuke/config-effect`); stacks
  with the built-in catalog without overriding it.
- **`AgentReport.partialReason`** — machine-readable enum for why a partial
  score is partial: `"typecheck-failed"` / `"no-deep"` / `"memory"` /
  `"no-source-files"`. Lets agents branch on the cause without parsing
  free-form text. `derivePartialReason()` helper exported from
  `@tsnuke/format-effect` for callers that pass it through.
- **`AgentReport.scoreBreakdown`** — explicit score-formula decomposition:
  `{ base, errorPenalty: { count, weight, total }, warningPenalty: { count,
  weight, total } }`. Agents can subtract two breakdowns across runs to see
  which rules drove the delta. Mirrors react-doctor's `100 − 1.5×err − 0.75×warn`
  reporting.
- **Real codemod fix payloads** for five previously-broken-auto-fix rules
  (RULE-026 — preserved verbatim from legacy but never emitted `fix.edits`):
  `triple-equals` (`==` → `===`), `no-var` (→ `let`),
  `no-array-constructor` (`Array(a, b)` → `[a, b]`),
  `no-inferrable-type-annotation` (drop the redundant `: number = 5`
  annotation), `consistent-type-definitions` (`type X = { … }` →
  `interface X { … }`, preserving modifiers + generics). `--fix` now applies
  these mechanically; `fixSummary.autoFixable` reflects real work.

### Changed
- **`scoreLabel: null` on partial scores** (agent JSON + pretty output). The
  band ("Great" / "Needs work" / "Critical") is reserved for fully-measured
  scores; labelling a partial measurement was the #1 driver of the maddie
  session confusion. The score number, `scorePartial`, `partialReason`, and
  `scoreBreakdown` carry the meaningful information instead.
- **Pretty + `--score` output drops the band on partial scores** and renders
  the specific `partialReason` caveat — e.g. `"partial — type-aware skipped:
  project doesn't type-check"`.
- **Pre-push hook defaults to `--diff --score`** (regression check, fast)
  instead of `--score` (full scan). Marker bumped `v1` → `v2`; the install
  command recognises v1 hooks as tsnuke-owned and upgrades them cleanly.
- **`SKILL.md` / `tsnuke agents` output**: replaced the inlined 98-row rule
  catalog table with a short rule INDEX (rule IDs grouped by category) plus a
  pointer to the per-rule prompt URL pattern. Agents fetch per-rule recipes
  on demand instead of paying the token cost up front.
- **`AGENTS.md` skill triggers** now include `"when the user types '/tsnuke'
  or asks to 'run tsnuke'"`.

### Fixed
- **JSONC parser corrupted any tsconfig containing `/` inside a string value.**
  Next.js / Vite scaffolds default to `"paths": { "@/*": ["./src/*"] }`; the
  regex-based comment stripper matched `/*` and `*/` across the string
  boundary, deleting the entire `paths` map and every downstream key —
  silently dropping `strict`, `noUncheckedIndexedAccess`, etc. for an
  enormous class of real projects. The maddie session's "all 4 CFG findings
  are wrong" was this defect. Replaced the regex pipeline with a string-aware
  state-machine stripper; the equivalence test mirror was updated to match
  the fixed behavior.
- **Engine's Tier-2 `ts.Program` used hardcoded compiler options** instead of
  the project's `tsconfig.json`-resolved ones, so any project with JSX
  (`jsx: "react-jsx"`), path aliases (`paths: { "@/*": ... }`), or non-default
  `lib`s generated phantom TS errors → `typecheckOk = false` → Tier-2 silently
  skipped on every non-trivial codebase. The engine now reads the project's
  tsconfig via `ts.parseJsonConfigFileContent`, strips emit-only flags
  (`incremental` / `tsBuildInfoFile` / `composite`), and forwards the resolved
  options to `buildProgramFromFiles`. The maddie session's "Tier-2 never
  engages despite typecheck:ok" was this defect.

### Numbers
- Tests: 1769 → **1964 passing**, 0 failures. All 33 packages typecheck clean.
- Self-scan: **100/100 — Great** (full-tier).
- Maddie regression test:
  - Before: `84/100 "Great" (partial)`, 4 CFG false positives,
    601 occurrences, 0 auto-fixable, 0 codemod.
  - After: `89/100, scoreLabel: null, partialReason: "typecheck-failed"`,
    0 CFG false positives, 426 occurrences (29% noise reduction from
    framework defaults alone), real codemods wired.

## [0.5.0] — 2026-05-27

### Added
- **3 SYN rules extracted from the `opencode-ts` skill catalog.** Same
  precedent as the `rules-functional-patterns` family in 0.4.0: each rule's
  `recommendation` paraphrases the source skill section
  (`opencode-ts/references/style-dna.md`). All `warning` + `fixKind: manual`;
  the two naming-idioms additions are tagged `ts-idiom`, the security one
  tagged `security`.
  - `no-useless-else` (naming-idioms) — flag `else` after a consequent that
    already terminates control flow (`return` / `throw` / `continue` /
    `break`). Conservative: doesn't flag when the consequent can fall through;
    chained `else if` after `return` still fires.
  - `prefer-const-ternary` (naming-idioms) — flag `let X;` (no init)
    immediately followed by `if (c) X = a; else X = b;` where both branches
    are bare single-statement assignments. Skips multi-statement blocks,
    chained `else if`, multi-binding `let`, destructuring.
  - `no-math-random-for-id` (security, CWE-330) — flag the canonical
    "fake ID" chain `Math.random().toString(36|16)` (also catches
    `Math["random"]()` bracket-notation form from minifier output).
    `Math.random()` alone is not flagged — legitimate uses (jittering,
    sampling, simulation) keep working.

### Changed
- **Catalog: 95 → 98 rules** across the same 14 categories (SYN 71 → 74;
  naming-idioms 14 → 16; security 5 → 6). Registry tally invariants and the
  per-slice barrel tests are updated in lock-step.
- **`tsnuke.config.json` test override expanded.** `no-unsafe-member-access`
  and `no-unsafe-call` added to the `/src/test/` override, matching the
  precedent already set for `no-non-null-assertion` /
  `no-record-string-unknown`. Tests doing structural assertions on serialized
  output (`JSON.parse(out).foo`) don't need a Schema decode.

### Fixed
- **`packages/cli/build.ts` latent typecheck bug.** `readFileSync(url)`
  without an encoding returns `Buffer`, which `JSON.parse` doesn't accept.
  The per-pkg `tsc --noEmit` never caught it because the pkg's `tsconfig.json`
  includes only `"src"` and `build.ts` lives at the pkg root. The engine
  walks the whole pkg (BC-06), so it was failing the typecheck probe and
  silently demoting the cli package to a partial score. Fix: pass `"utf-8"`.

### Self-score
- 33/33 projects at **100/100**, no partial flag. (Was `100*` on the cli
  pkg — the asterisk was the partial-Tier-2 marker hiding the latent
  `build.ts` bug above.)

## [0.4.0] — 2026-05-27

### Added
- **`rules-functional-patterns` category — 7 SYN rules.** Inverts the patterns of
  the `implementation-functional-patterns` skill catalog: each rule fires on the
  GoF / imperative class shape the skill says a TS-speaker should write as a
  function, tagged union, or stream method. All `warning` + `fixKind: manual`
  (every detection requires a real refactor — `--explain` carries each
  recipe). Tagged `ts-idiom`, joining the existing anti-slop family.
  - `no-singleton-class` — `class X { private/protected static instance; static getInstance() }`
    (use a module-scope const or lazy `??=` memo).
  - `no-mutable-builder-class` — class with ≥2 `return this` methods + a
    `build`/`create`/`finish`/`make` finisher (use an object literal + optional
    fields, or a fluent immutable builder).
  - `no-factory-class` — non-abstract class whose only method (static OR
    instance) is `create`/`make`/`build`/`of`/`from` (use a factory function
    returning a tagged object).
  - `prefer-generator-over-iterator-class` — class with instance `next` AND
    instance `[Symbol.iterator]` (use a generator function).
  - `prefer-reduce-over-imperative-sum` — `for`/`for-of` with single-statement
    `IDENT += EXPR` body (use `.reduce`). Skips `for await` correctly.
  - `prefer-group-by-over-imperative-groups` — 2-statement
    `if (!g[k]) g[k] = []; g[k].push(x)` loop (use `Object.groupBy` /
    `Map.groupBy`). Accepts `!X[k]`, `=== undefined`/`== undefined`,
    `=== null`/`== null`, and `!(k in X)` condition shapes; unwraps `!` non-null
    assertions on the push receiver.
  - `prefer-flatmap-over-reduce-concat` — `reduce((acc, x) => acc.concat(...), [])`
    O(n²) trap (use `.flatMap`).
  - All four class detectors recognize `const X = class { … }` expressions in
    addition to declarations; the builder + iterator detectors recognize
    `PropertyDeclaration` with arrow-function initializer as instance methods
    (`size = (s) => { …; return this }`, `next = () => …`).
- **Workspace-root `tsnuke.config.json`.** When the CLI is pointed at a workspace
  root, `diagnoseWorkspace` now loads a single `tsnuke.config.json` at the root
  and applies it to every member project (BC-05 extension) instead of requiring
  one file per package. Members can still opt out by passing `options.config`
  explicitly; tests are unchanged. (`packages/engine`, `packages/cli`.)
- **`--all` CLI flag.** In workspace mode the per-project table now truncates to
  the 7 worst by default; `--all` expands every project.
- **`renderWorkspacePretty` tests.** 12 cases covering sort, alignment,
  truncation, CTA distribution, partial-score legend, colour discipline.

### Changed
- **Workspace TUI redesign.** Replaced the 4-line nuke-icon panel + 22-cell
  per-row bar (visually identical at the typical 93–99 score range) with a
  worst-first table at dynamic column widths: `WORST · score · err · warn`.
  Workspace path is now tilde-ified; counts use thousands separators; the CTA
  promotes the focus rule with its package distribution; a `*` legend appears
  when any member is a partial score. Single-project mode unchanged.
- **`prefer-error-instantiation` rule heuristic.** Tightened to PascalCase
  identifiers — previously fired on any call whose name ended in `Error`,
  flagging helpers like `serializeError`, `isTsNukeError`, `mapError`.
  Constructor convention is now part of the predicate.
- **Workspace report sorting.** Projects are listed worst-first (lower score
  first; ties broken by error count, then total, then name) instead of
  alphabetically.

### Fixed
- **Production-code non-null assertions.** Removed every `!` in `src/main`
  files by adding proper narrowing — `no-import-cycles` DFS frames,
  `default-case-last` clause lookup, `no-useless-catch` statement check,
  `no-array-constructor` arg check.
- **`no-double-assertion` and `no-unsafe-call` errors** (15 sites, all in
  tests) — replaced `as X as Y` chains with single-cast-via-`unknown`,
  switched `ts.SourceFile` fakes to `ts.createSourceFile`, replaced a dynamic
  `await import()` with a static import where the types had collapsed to `any`.
- **`no-unsafe-object-assertion`** in `serializeError`, `isTsNukeError`,
  `parsePackageJsonWorkspaces` — `(x as { k?: T }).k` replaced with proper
  `"k" in x` narrowing.
- **`prefer-array-methods`** in `fix-applier/applyFixes.ts`,
  `module-graph/buildModuleGraph.ts`, and two test files — push-loops →
  `.flatMap` / `.filter` / `Array.from`.
- Smaller cleanups: `prefer-satisfies-over-as` on 30+ test fixtures,
  `no-unnecessary-template-literal`, `consistent-type-definitions`,
  `explicit-member-accessibility` on error subclasses, unused exports on
  `single`/`CapturingIo`/`ruleCatalog` in CLI test fixtures, missing re-export
  of `buildWorkspaceJsonString` for symmetry with `buildJsonString`.

### Self-score
- tsnuke now scores itself **100/100** across all 33 packages (was 93/100*).
  Policy is expressed in the new workspace-root `tsnuke.config.json` —
  documented per-glob overrides for test code, vitest configs, frozen oracle
  copies (verbatim legacy code kept for differential equivalence proofs), and
  rule sources that necessarily contain the patterns they detect. No
  production code path is suppressed without a documented reason.

## [0.3.0] — 2026-05-26

### Added
- **Nuke-themed status icon.** Score band drives the icon: `╔═╗ / ╚═╝`
  (warhead contained, ≥ 75), `░░░ / ╲│╱` (smoke rising, ≥ 50), `▓█▓ / ╱│╲`
  (mushroom cloud, < 50).
- **Doctor-style report.** Header + tier line (`SYN ●●●  TYP ●●  GRAPH ─  CFG ─`)
  + rule-grouped diagnostics + footer with stats and CTA.
- **Agent JSON extras.** `nextAction`, `tierBreakdown`, `fixSummary` headlines so
  agents don't have to recompute them.

### Changed
- Migrated `build.mjs` → `build.ts` (no `.js` in source).
- README updated with the new report + agent JSON shape.

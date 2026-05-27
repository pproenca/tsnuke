# Changelog

All notable changes to `tsnuke` are listed here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project follows
[SemVer](https://semver.org/spec/v2.0.0.html).

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

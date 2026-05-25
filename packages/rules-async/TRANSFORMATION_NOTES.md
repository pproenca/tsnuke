# Transformation Notes — `async` rule category → Effect-TS

Strangler-fig slice produced by
`/code-modernization:modernize-transform tsnuke rules-async effect`.

Source (READ-ONLY): `legacy/tsnuke/packages/tsnuke-rules/src/rules/async/`
(+ the `Diagnostic`/`RuleMeta`/`Fix`/`TextEdit` contracts and the
`defineRule`/`runRule`/`runTypeAwareRule` substrate, now owned by
`@tsnuke/contracts-effect` and `@tsnuke/rules-core-effect` respectively).
Target: `modernized/rules-async/effect/` (package `@tsnuke/rules-async-effect`).

Implements **RULE-025** (async row): the 7-rule async category, split **4 SYN + 3 TYP**.
The async row of RULE-025 is special: it holds `no-floating-promises` — the **ONLY rule
in the entire ~88-rule catalog that emits a real `fix` payload** (RULE-032 fix taxonomy:
6 declare `auto-fix`, only this one actually emits edits; RULE-026 documents the other 5
as no-ops). Its fix was ported **VERBATIM** (see §2 D4).

**Result:** 58/58 characterization tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` · both `file:` deps
(`rules-core-effect`, `contracts-effect`) link and resolve · `runTypeAwareRule` (live
`ts.TypeChecker`) drives all three TYP rules.

---

## 1. Mapping table (legacy rule file → target)

| Rule | Tier | Business rule | Legacy source | Target |
|------|------|---------------|---------------|--------|
| `no-async-promise-executor` | SYN | RULE-025 (async) | `…/async/no-async-promise-executor.ts` | `src/main/no-async-promise-executor.ts` |
| `no-await-in-loop` | SYN | RULE-025 (async) | `…/async/no-await-in-loop.ts` | `src/main/no-await-in-loop.ts` |
| `no-return-await` | SYN | RULE-025 (async) | `…/async/no-return-await.ts` | `src/main/no-return-await.ts` |
| `require-await` | SYN | RULE-025 (async) | `…/async/require-await.ts` | `src/main/require-await.ts` |
| `await-thenable` | TYP | RULE-025 (async, BC-10) | `…/async/await-thenable.ts` | `src/main/await-thenable.ts` |
| `no-floating-promises` | TYP | RULE-025 / **RULE-032** (the real fix) | `…/async/no-floating-promises.ts` | `src/main/no-floating-promises.ts` |
| `no-misused-promises` | TYP | RULE-025 (async, BC-10) | `…/async/no-misused-promises.ts` | `src/main/no-misused-promises.ts` |
| category barrel + `asyncRules` registry | — | (v1 manual codegen seam) | (codegen would fold into the global registry) | `src/main/index.ts` |
| `runRule` / `runTypeAwareRule` drivers | — | legacy `tsnuke-rules/src/test-utils.ts` | imported from `@tsnuke/rules-core-effect` (not vendored) | `src/test/*.test.ts` |
| legacy `*.test.ts` vectors | — | the behavioral spec | `…/async/*.test.ts` | ported into `src/test/*.test.ts` |

Each predicate was ported **VERBATIM** — same META (id / severity / category / tier /
`requires` / fixKind / tags / recommendation), same helper functions (`isLoop`,
`isFunctionBoundary`, `isInsideTryBlock`, `isAsyncFn`, `bodyHasAwait`, and the shared
`isThenable` in the three TYP rules), same `ts.is*` guards, same parent-chain walks /
function-boundary stops, same `getStart` + `getLineAndCharacterOfPosition` + `+1` 1-based
positions, same report message / help text. The diagnostic-construction (auto-fill of
`plugin` / `rule` / `tier` / `category` / `severity` from meta) is the same
`createRuleContext` / `buildDiagnostic` path, now living in `rules-core-effect`.

---

## 2. Deliberate deviations from legacy behavior

**None behavioral.** The predicates are byte-for-byte the legacy logic. The only changes
are structural / dependency-routing:

### D1 — Import the substrate, do NOT re-vendor it
- `defineRule` (and the `RuleContext` type, used by `no-return-await`, `require-await`,
  `no-misused-promises`) are imported from `@tsnuke/rules-core-effect` instead of the
  legacy relative `../../define-rule.js`.
- `runRule` (SYN driver) and `runTypeAwareRule` (TYP driver — builds a one-file
  `ts.Program` with a real default lib + a live `ts.TypeChecker`) are imported from
  `@tsnuke/rules-core-effect` in the tests — the engine drives these rules through the
  *same* walk/dispatch, so the tests exercise the real production drivers, not a copy.
- `Diagnostic` / `RuleMeta` / `Fix` / `TextEdit` come from `@tsnuke/contracts-effect`
  transitively (the SYN rules never name them; the `fix` payload `no-floating-promises`
  emits flows through `ctx.report` and is type-checked against the contract `Fix`/`TextEdit`
  via `ReportInput`). This slice re-vendors no contract or substrate symbol.

### D2 — Two `file:` deps + double inline (consumption pattern)
`package.json` adds `@tsnuke/rules-core-effect` **and** `@tsnuke/contracts-effect`
as `file:` deps, plus `typescript` as a real **dependency** (not devDependency): the rules
call `ts.SyntaxKind` / `ts.is*` / `getLineAndCharacterOfPosition` / `checker.getTypeAtLocation`
/ `checker.typeToString` at **runtime**, so the compiler API is a production dependency.
`vitest.config.ts` inlines **both** packages (`server.deps.inline`) because each is a
`.ts`-entry `file:` link and rules-core itself imports contracts — same pattern the
type-performance sibling uses.

### D3 — Barrel hygiene (no symbol re-publishing)
`src/main/index.ts` exports only what this slice owns: the seven rules (by stable name) and
`asyncRules: ReadonlyArray<Rule>`. It does **not** re-export `defineRule` / `runRule` /
`runTypeAwareRule` / `Diagnostic` / `RuleMeta` / `Fix` / `TextEdit` — consumers import those
from their owning packages (mirrors rules-core's own barrel discipline).

### D4 — `no-floating-promises`: the ONE real fix, preserved VERBATIM (RULE-025 / RULE-032)
This is the only rule in the entire catalog that attaches a real `fix`. Preserved exactly:
- `fixKind: "auto-fix"` in the meta.
- The `report({ … fix: { kind: "auto-fix", edits: [{ start, end: start, replacement:
  "void " }], inferredType: checker.typeToString(type) } })` payload — the fix `kind`, the
  single **zero-width** `TextEdit` (`start === end` at the floating expression's
  `getStart(...)` offset, replacement `"void "`), and the checker-inferred `inferredType`
  are byte-for-byte the legacy payload (BC-14).
- The test asserts the exact edit, not just that a diagnostic fired: for
  `Promise.resolve(1);\n` the edit is `{ start: 0, end: 0, replacement: "void " }` and
  `inferredType === "Promise<number>"`; an indented case pins the insert offset to the
  expression start (not column 0) to prove the edit tracks `getStart`.

### D5 — TYP gating preserved (BC-10 / RULE-018)
All three TYP rules early-return `if (ctx.checker === undefined)` and only emit under a live
checker — unchanged. The tests prove BOTH directions: `runTypeAwareRule` (checker present)
fires; `runRule` (no checker) yields nothing for the same snippet (the "gated path" case,
ported from legacy for all three).

---

## 3. Equivalence strategy (the proof)

**Characterization-test TDD.** The legacy `*.test.ts` cases ARE the behavioral spec, so
every legacy vector was ported first, then the implementation made to pass them:

- **Ported legacy vectors** (the equivalence proof): every legacy assertion across all 7
  rules' `*.test.ts`, unchanged snippets + assertions. SYN rules through `runRule`; TYP
  rules through `runTypeAwareRule` (+ the `runRule`-yields-nothing gated-path case each).
- **Added negatives** (per the task): awaited / voided / returned / assigned promises are
  NOT flagged (`no-floating-promises`); thenable union & custom-`then` operands NOT flagged
  (`await-thenable`); plain / awaited boolean conditions NOT flagged (`no-misused-promises`);
  plain & function-expression executors, no-arg / non-function first arg NOT flagged
  (`no-async-promise-executor`); nested-callback await across a function boundary NOT counted
  (`no-await-in-loop`); bare `return` & nested-scope await handled (`no-return-await` /
  `require-await`).
- **Added coverage of every dispatched form**: all five loop kinds (`no-await-in-loop`); all
  four async function-likes + `for await` (`require-await`); `if`/`while`/`do-while`/ternary
  (`no-misused-promises`); the `finally`-vs-`tryBlock` distinction (`no-return-await`).
- **Added full-shape + position assertions**: every diagnostic's 1-based `line` / `column`,
  `message`, `help`, `severity`, `tier`, `category`, `plugin`, `rule` id (the legacy tests
  asserted only a subset). The non-fix TYP rules additionally assert `fix === undefined` to
  pin that `no-floating-promises` is the *only* fix-bearing rule.

**58 tests total** across the 7 rules. Driven through the real `runRule` /
`runTypeAwareRule` from rules-core — the same parse → (program+checker) → walk →
dispatch-by-`SyntaxKind` the engine uses — so the equivalence holds for the production path,
not a test-only harness.

---

## 4. What was NOT migrated (and why)

- **The predicates stayed plain, synchronous AST/type-aware visitors — NOT `Effect`-wrapped.**
  Deliberate and consistent with the substrate: rule visitors are pure sync callbacks over
  an in-memory `ts.forEachChild` walk; a fiber buys nothing. The type-aware rules call the
  `ts.TypeChecker` synchronously inside the same walk. Effect appears only in the contract
  layer (`Diagnostic` / `RuleMeta` / `Fix` / `TextEdit` are `effect/Schema` in contracts),
  never in these predicates.
- **The substrate + contracts** (`defineRule` / `runRule` / `runTypeAwareRule` / `Diagnostic`
  / `RuleMeta` / `Fix` / `TextEdit`) were NOT copied — consumed read-only from their owning
  packages (D1).
- **No dead code** in the seven legacy rule files — every line is live, so nothing dropped.

---

## 5. Follow-ups

1. **The 3 TYP rules require `typecheck:ok` — the engine gates them.** `await-thenable`,
   `no-floating-promises`, `no-misused-promises` declare `requires:["typecheck:ok"]` and
   early-return without a checker (BC-10 / RULE-018). The engine must only run them on the
   Tier-2 path (clean type-check) where it supplies the `ts.TypeChecker`, exactly as
   `runTypeAwareRule` does in the tests. On the broken-project / Tier-1 path they emit nothing.
2. **`no-floating-promises`' fix flows into the `--fix` applier slice (RULE-005 / RULE-032).**
   This rule produces the only real `fix` in the catalog; a later `--fix` applier slice will
   collect `fix.edits` from `auto-fix` diagnostics and splice them into the source
   (`{ start, end, replacement }` half-open offsets). The `inferredType` rides along for the
   agent report (`format-agent` cheapest-action-first ordering, RULE-032). RULE-026's 5
   no-op `auto-fix` rules (triple-equals, no-var, …) are a separate cleanup; this slice does
   not touch them.
3. **Category registry shape.** `asyncRules` is `ReadonlyArray<Rule>`; when the full-catalog
   codegen (legacy `scripts/generate-rule-registry.mjs`) lands it folds these into the global
   `ruleRegistry` (the hand-written list in rules-core is the v1 codegen seam). If the codegen
   prefers a keyed map (`Record<id, Rule>`) the array folds with
   `Object.fromEntries(rules.map(r => [r.id, r]))` at the seam — no rule change. The engine
   reads each rule's `tier`/`requires` to route SYN-vs-TYP.

---

## 6. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** follows the established slice convention (consistent
  with score / rules-core / type-performance).
- **`typescript` is a runtime `dependency`**, not a devDependency (the rules use the compiler
  API — and, for TYP rules, the `ts.TypeChecker` — at runtime).
- **`runTypeAwareRule` needs a real default lib.** It builds a one-file `ts.Program` so the
  checker can resolve `Promise`, `then`, unions, etc.; this is why the TYP tests are slower
  than the SYN tests (each spins up a program + checker). This is the production Tier-2 cost.
- **Run:** `cd modernized/rules-async/effect && pnpm test` (vitest) · `pnpm typecheck` (tsc).
  Both green: 58/58 · tsc exit 0.

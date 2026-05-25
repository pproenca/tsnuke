# Characterization tests — `rules-core` substrate (Effect-TS target)

These tests **define "done"** for the rule SUBSTRATE rewrite: `defineRule` +
`RuleContext`/`RuleVisitors` + `createRuleContext` (and the GRAPH variants),
`diagnosticIdentity` (BC-13), the `ModuleGraph` contract, the 4 AST-free
`strictness` rules (RULE-020), and the hand-written `ruleRegistry`. They were
written *before* the implementation. The implementation lives at `src/main/`
(imported as `../main/index.js` — `.js` on relative specifiers, per the legacy
convention; `Bundler` moduleResolution resolves `.js` → `.ts`). Until that module
existed the suite was **RED**, the correct starting state.

This is the first slice to **CONSUME `@ts-doctor/contracts-effect`** rather than
vendor `Diagnostic`/`RuleMeta` (the first NEW contracts consumer). `ModuleGraph`
is OWNED here (single-site GRAPH-tier input; not in contracts). The legacy modules
are the oracle (`legacy/ts-doctor/packages/ts-doctor-rules/src/{define-rule,identity}.ts`
\+ `rules/strictness/*.ts`, read-only).

## Rules under test

| Rule | What | File |
|------|------|------|
| RULE-020 | inverted CFG gating — the 4 `enable-X` strictness rules fire iff their `disabledBy` token is ABSENT; AST-free (`create()` → `{}`) | `strictnessRules.test.ts`, `equivalence.test.ts` |
| BC-13 | deterministic diagnostic identity `filePath::line:column::plugin/rule` | `identity.test.ts`, `equivalence.test.ts` |
| BC-18 | `plugin` forced to `"ts-doctor"` on every emitted diagnostic | `createRuleContext.test.ts`, `equivalence.test.ts` |
| RULE-031 | severity vocabulary (`error`/`warning`, no `info`) carried in meta | `strictnessRules.test.ts` |
| RULE-032 | fix-kind taxonomy (`manual` for the strictness rules) carried in meta | `strictnessRules.test.ts` |
| (C20 seam) | the registry contains exactly the 4 strictness rules with unique ids | `registry.test.ts` |

## The `createRuleContext.report` auto-fill (the substrate's core behavior)

`createRuleContext(meta, {sourceFile, filePath, checker?, sink})` returns a context
whose `report(input)` builds a full `Diagnostic` and hands it to `sink`:

- `plugin` is **forced** to `"ts-doctor"` (cannot be overridden — not in `ReportInput`).
- `rule`/`tier`/`category`/`severity` **default from `meta`** but each is overridable.
- `filePath`/`message`/`help`/`line`/`column` come straight from the input (required).
- `url`/`fix`/`suppressionHint` are **only set when present** — the
  `exactOptionalPropertyTypes`-safe conditional spread. An absent optional key is
  ABSENT on the output object (not `key: undefined`). `createRuleContext.test.ts`
  pins this with `expect(out).not.toHaveProperty("url")` etc.

The tests drive `report` with a **fake `sink`** (no real AST needed) — the
substrate's `report` logic is independent of the parsed file.

## RULE-020 gating semantics — what is and is NOT tested here

The 4 strictness rules are AST-free: `create()` returns `{}` (no visitors), so they
emit NOTHING per-file. Their entire behavior is the **activation decision**, which
is driven by their META (`requires`/`disabledBy`). The actual `shouldActivate`
predicate lives in the **capabilities** slice — NOT here. So these tests assert the
**META that drives** RULE-020 (e.g. `enable-strict` has `disabledBy: ["strict"]`,
`enable-use-unknown-in-catch` has the dual gate `["useUnknownInCatchVariables",
"strict"]`), and that `create()` returns `{}` — they do NOT re-test `shouldActivate`.

## How the equivalence proof works (`equivalence.test.ts`)

1. **Vendored, attributed frozen copies** of the legacy algorithm as the oracle:
   - `legacyCreateRuleContext` (legacy `define-rule.ts:54-93`) — the exact auto-fill
     + conditional-spread.
   - `legacyDiagnosticIdentity` (legacy `identity.ts:12-14`).
   - `LEGACY_STRICTNESS_META` — the 4 rules' meta copied verbatim from
     `rules/strictness/*.ts`.
2. Over **crafted `ReportInput`s** (minimal, all-overrides, each-optional-present /
   each-optional-absent), assert the modern `report` output `toStrictEqual` the
   legacy oracle's output (full structural equality of the built `Diagnostic`).
3. Assert each modern strictness rule's **meta** `toStrictEqual` the legacy meta.
4. Assert `diagnosticIdentity` matches the legacy oracle over crafted diagnostics.

## Running

```sh
cd modernized/rules-core/effect
./node_modules/.bin/vitest run          # all tests once
./node_modules/.bin/vitest run src/test/equivalence.test.ts   # just the proof
./node_modules/.bin/tsc --noEmit        # typecheck
```

Vitest must transpile the `.ts`-entry `@ts-doctor/contracts-effect` dependency at
test time; `vitest.config.ts` sets `test.server.deps.inline:
["@ts-doctor/contracts-effect"]` (the `file:` link's `exports` is
`./src/main/index.ts`).

## Public surface these tests expect (write the impl to match)

```ts
import {
  PLUGIN_NAME,                 // "ts-doctor"
  defineRule,                  // (meta, create) => Rule
  createRuleContext,           // (meta, {sourceFile, filePath, checker?, sink}) => RuleContext
  defineGraphRule,             // (meta, analyze) => GraphRule
  createGraphRuleContext,      // (meta, {graph, sink}) => GraphRuleContext
  diagnosticIdentity,          // (d: Diagnostic) => string  (BC-13)
  ruleRegistry,                // ReadonlyArray<Rule> — the 4 strictness rules
} from "../main/index.js";
import type {
  Rule, RuleContext, RuleVisitors, ReportInput,
  GraphRule, GraphRuleContext, ModuleGraph,
} from "../main/index.js";
// Diagnostic / RuleMeta / Severity / Tier / FixKind are NOT re-exported here —
// import them from @ts-doctor/contracts-effect (this slice consumes, not vendors).
```

The substrate is a PLAIN-TS wrapper of the TS compiler API — NOT `Effect`-wrapped
(rule visitors are pure synchronous AST callbacks). Effect appears only via the
imported `Diagnostic`/`RuleMeta` Schemas' `.Type`.

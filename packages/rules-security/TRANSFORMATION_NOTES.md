# Transformation Notes — `security` rule category → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform ts-doctor
security effect`. Source (READ-ONLY):
`legacy/ts-doctor/packages/ts-doctor-rules/src/rules/security/*.ts` (+ colocated
`*.test.ts`). Target: `modernized/rules-security/effect/`
(`@ts-doctor/rules-security-effect`).

Implements the **security** half of **RULE-025** (per-rule detection predicates):
the 5 SYN AST/regex rules. This slice is the SECOND consumer of the rule substrate
(`@ts-doctor/rules-core-effect`) after `rules-declaration-api`, and consumes the
canonical contracts from `@ts-doctor/contracts-effect` transitively (no re-vendor).

> NOTE — DISTINCT from `@ts-doctor/security-effect`. That slice is the 5 DORMANT
> CORE GUARDS (glob/git/env/plugins/etc., RULE-027/RULE-039). THIS slice is the 5
> RULE-CATALOG security LINT rules (RULE-025). Same English word, different layer.

**Result:** 53/53 characterization tests pass · `tsc --noEmit` clean under
`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` ·
`file:` deps to rules-core-effect + contracts-effect resolved (vitest
`server.deps.inline`, two deps).

---

## 1. Mapping table (legacy → target)

| Rule (id) | Legacy source | Target | Severity | Node kinds matched |
|-----------|---------------|--------|----------|--------------------|
| `no-eval-or-function-constructor` | `security/no-eval-or-function-constructor.ts` | `src/main/no-eval-or-function-constructor.ts` | error | `CallExpression` (callee id `eval`), `NewExpression` (callee id `Function`) |
| `no-implied-eval` | `security/no-implied-eval.ts` | `src/main/no-implied-eval.ts` | error | `CallExpression` — bare/member `setTimeout`/`setInterval` with string/template 1st arg |
| `no-insecure-url` | `security/no-insecure-url.ts` | `src/main/no-insecure-url.ts` | **warning** | `StringLiteral`, `NoSubstitutionTemplateLiteral` (`^http://`, loopback exempt) |
| `no-new-buffer` | `security/no-new-buffer.ts` | `src/main/no-new-buffer.ts` | error | `NewExpression` (callee id `Buffer`) |
| `no-secrets-in-source` | `security/no-secrets-in-source.ts` | `src/main/no-secrets-in-source.ts` | error | `StringLiteral`, `NoSubstitutionTemplateLiteral` (vendor regex over `.text`) |

Barrel: `src/main/index.ts` — each rule by name (`noEvalOrFunctionConstructor`,
`noImpliedEval`, `noInsecureUrl`, `noNewBuffer`, `noSecretsInSource`) +
`securityRules: ReadonlyArray<Rule>` (alphabetical-by-id, matching the legacy
codegen ordering). It does NOT re-export rules-core / contracts symbols (barrel
hygiene — import those from their owning packages).

### Per-rule test coverage (53 total)
| Test file | Tests | Includes |
|-----------|-------|----------|
| `no-eval-or-function-constructor.test.ts` | 10 | 3 ported + position/message + 5 negatives (`foo.eval`, `evalThing`, `new MyFunction`, bare `Function`, both-in-file) |
| `no-implied-eval.test.ts` | 10 | 2 ported + message + `setInterval`/member/template variants + 3 negatives |
| `no-insecure-url.test.ts` | 10 | 4 ported + message(warning)/position + `127.0.0.1`/case-insensitive/anchoring/loopback-frozen negatives |
| `no-new-buffer.test.ts` | 6 | 2 ported + message/position + 3 negatives (`Buffer.alloc`, `new MyBuffer`, bare `Buffer`) |
| `no-secrets-in-source.test.ts` | 13 | 2 ported + each FROZEN vendor shape positive + too-short/wrong-charset/wrong-prefix negatives |
| `index.test.ts` | 4 | registry completeness, tier/category/tags, identity, severity split (4 error / 1 warning) |

---

## 2. Equivalence proof

The legacy colocated `*.test.ts` cases ARE the legacy behavioral spec; every one
is ported VERBATIM and passes against the rewrite driven through the same
`runRule` driver (`@ts-doctor/rules-core-effect`, the de-vendored port of legacy
`test-utils.ts`). On top of the ported vectors, ADDED negative cases prove the
predicates are not too greedy:
- identifier-name matching is exact (`evalThing`, `MyFunction`, `MyBuffer`,
  `foo.eval` member call all do NOT fire);
- `no-insecure-url`'s `^http://` anchor and loopback regex are preserved exactly
  (embedded `see http://...` does NOT fire; `localhost.evil.com` IS exempt —
  asserted as frozen legacy behavior, not "fixed");
- `no-secrets-in-source`'s vendor shapes are length/charset/prefix-exact
  (`AKIA`+15, lowercase AWS, `ghp_`+35, `sk_live_`+15, `sk_test_` all do NOT fire).

Message / help / severity / category / tier / 1-based line+column are asserted
byte-for-byte against the legacy strings.

---

## 3. Deviations from legacy

**None behavioral.** Each rule's META, predicate, regex/key-shape patterns,
message/help text, matched node kinds, and 1-based line/column are ported
byte-for-byte. The only mechanical changes:

- **D1 — import source.** `import { defineRule } from "../../define-rule.js"`
  → `from "@ts-doctor/rules-core-effect"` (same for the `RuleContext` type import
  in `no-insecure-url` / `no-secrets-in-source`). The slice CONSUMES the substrate
  + contracts rather than re-vendoring them — same posture as
  `rules-declaration-api`. The `Diagnostic`/`RuleMeta` contracts arrive
  transitively from `@ts-doctor/contracts-effect` (the canonical Schema home); no
  copy lives here.
- **D2 — test import + path.** Tests import `runRule` from
  `@ts-doctor/rules-core-effect` (not the legacy `../../test-utils.js`) and the
  rule from `../main/<id>.js`. Vectors unchanged.

The predicates remain PLAIN-TS AST/regex callbacks — NOT Effect-wrapped. A fiber
buys nothing for a synchronous `ts.forEachChild` walk (the substrate's documented
stance); the Effect-native value is in the contracts (`effect/Schema`) the
diagnostics conform to, owned upstream.

### FROZEN patterns kept verbatim (RULE-025)
The three credential regexes in `no-secrets-in-source.ts` are vendor-anchored
(prefix + fixed token length) and copied byte-for-byte:
```
/\bAKIA[0-9A-Z]{16}\b/        // AWS access key id
/\bghp_[A-Za-z0-9]{36}\b/     // GitHub personal access token
/\bsk_live_[A-Za-z0-9]{16,}\b/ // Stripe live secret key
```
Per RULE-025 the category is vendor-anchored regex scanning ONLY — there is NO
entropy heuristic, by design (false-positive prone). Do not "improve" these.

---

## 4. Driver note: SourceFile-keyed vs node-keyed

`runRule` fires a `SourceFile`-keyed visitor ONCE for the whole file (the path
whole-file/comment/text rules use), then walks every node dispatching the visitor
registered for its `SyntaxKind`. **All 5 security rules are NODE-keyed** —
`no-secrets-in-source` and `no-insecure-url` key on `StringLiteral` /
`NoSubstitutionTemplateLiteral` (per-literal `.text` regex), NOT on `SourceFile`.
This is the exact legacy shape and is preserved as-is. (The `SourceFile`-keyed
once-per-file path exists in the driver for future whole-file regex rules; the
security category does not use it.)

---

## 5. Follow-ups

- **SYN-only category.** All 5 are Tier-1 (AST/regex, no checker). No TYP/GRAPH
  work here; `runTypeAwareRule` lands with the first TYP category.
- **Registry codegen seam.** `securityRules` is the hand-written category slice,
  same shape the eventual codegen (`generate-rule-registry.mjs`) will emit. When
  the full ~88-rule catalog registry lands it concatenates these category slices;
  ordering is alphabetical-by-id to match.
- **RULE-025 SME note.** No threshold/budget constants apply to the security
  category (those are RULE-006/007/008/010 in other categories). `no-secrets`
  remains regex-only with no entropy heuristic — that is the confirmed product
  policy, not a placeholder.
- **`no-insecure-url` loopback breadth.** `^http://(localhost|127\.0\.0\.1)` also
  exempts `http://localhost.evil.com` (any host PREFIXED with `localhost`). This
  is frozen legacy behavior, asserted in the tests. If product wants strict
  host-boundary matching it is a one-line change isolated in
  `no-insecure-url.ts`, but it would be a behavioral deviation requiring sign-off.

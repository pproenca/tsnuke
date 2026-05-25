# Transformation Notes — `errors` → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform tsnuke errors effect`.
Source (READ-ONLY): `legacy/tsnuke/packages/core/src/errors.ts` (61 lines).
Target: `modernized/errors/effect/` (package `@tsnuke/errors-effect`).

Implements **RULE-037** (tagged discovery error classes). Legacy DELIBERATELY
moved AWAY from Effect tagged errors to plain `Error` subclasses with a `_tag`
discriminant; the target stack is Effect, so this slice moves BACK to idiomatic
`effect/Schema` tagged errors (`Schema.TaggedError`) — while preserving the exact
observable contract that `build-report`'s `serializeError` depends on. Verified by
52 characterization tests, including a differential equivalence proof against a
vendored frozen copy of the legacy classes.

**Result:** 52/52 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.

**Downstream contract preserved (the `build-report` dependency):** every error is
`instanceof Error`, and `cause` lands on the **native `.cause`** property
(`Schema.TaggedError` forwards a `cause` prop to the `Error` constructor) — so
`serializeError`'s `instanceof Error` check and root-last `.cause` walk keep
working unchanged. Both are verified explicitly (see §1 / equivalence.test.ts).

---

## 1. Mapping table (legacy → target, per behavior)

| Behavior | Legacy `errors.ts` | Target |
|----------|--------------------|--------|
| Base error, `_tag`/`name` = `"TsNukeError"` | `:10-20` | `src/main/Errors.ts:42` (`Schema.TaggedError<TsNukeError>()("TsNukeError", …)`) |
| `ProjectNotFoundError`, `_tag`/`name` parity | `:23-29` | `src/main/Errors.ts:51` |
| `NoTypeScriptProjectError`, `_tag`/`name` parity (BC-06) | `:32-38` | `src/main/Errors.ts:60` |
| `TsconfigNotFoundError`, `_tag`/`name` parity (BC-06) | `:41-47` | `src/main/Errors.ts:69` |
| `AmbiguousProjectError`, `_tag`/`name` parity | `:50-56` | `src/main/Errors.ts:78` |
| `(message, { cause })` constructor signature | each `constructor` | `src/main/Errors.ts` ctors + `buildProps` `:92` |
| `cause` → native `.cause` chaining | `super(message, options)` `:15` | `Schema.TaggedError` forwards `cause` prop; `buildProps` includes it only when supplied |
| `isTsNukeError` type guard | `:59-61` (`instanceof`) | `src/main/Errors.ts:128` (`_tag` membership of `TSNUKE_ERROR_TAGS`) |
| Prototype-chain restore (ES5 transpile fix) | `:18` `setPrototypeOf` | **removed** — target is ES2022, no down-level `extends` break (see §3) |

The legacy classes set `name` imperatively (`this.name = "…"`) and aliased it to
a `_tag` field. `Schema.TaggedError<X>()(tag, fields)` sets BOTH `_tag` and `name` to the tag
literal for us — so the wire-visible `name` and the structural `_tag` are
identical to legacy without any per-class assignment.

---

## 2. Deliberate deviations from legacy behavior

### D1 — Plain `Error` subclass → `effect/Schema` tagged error (the whole point)
Legacy used hand-rolled `Error` subclasses to avoid a runtime framework. The
target stack IS Effect, so each class is now a `Schema.TaggedError<X>()(tag, fields)`. This is
purely a representation change — the observable contract (`_tag`, `name`,
`message`, `instanceof Error`, native `.cause`) is **identical**, proven
differentially in `equivalence.test.ts`. Bonus (additive, invisible to
consumers): instances now have Effect's structural `Equal`/`Hash` and pretty
inspection.

### D2 — Shared base class → five INDEPENDENT tagged errors ⚠️ (changes `instanceof` of the base)
Legacy had ONE base class `TsNukeError`; every subclass was `instanceof
TsNukeError`, and that's what the guard used. With `Schema.TaggedError` you CANNOT
keep both a shared instance base AND correct per-class `name`: Effect derives
`name` from the tag literal passed to `Schema.TaggedError<X>()(...)`, so subclassing a
single tagged base would freeze every subclass's `name` to `"TsNukeError"`
(verified during scaffolding) — breaking the RULE-037 / `serializeError` `name`
contract. So each of the five is its own independent `Schema.TaggedError`.

- **Consequence:** a `ProjectNotFoundError` is **no longer `instanceof` a single
  base class** (there is no shared base instance). `instanceof Error` still holds
  for all five — and that is the only `instanceof` the downstream `serializeError`
  actually performs.
- **How the guard preserves semantics:** `isTsNukeError` is reimplemented as a
  **contract-based** check — `value instanceof Error && _tag ∈ TSNUKE_ERROR_TAGS`
  (`Errors.ts:128`). It returns `true` for all five tags and `false` for
  non-errors, foreign `Error`s, and `_tag`-shaped plain objects — proven identical
  to the legacy `instanceof`-guard's classifications in `equivalence.test.ts`.
  The `instanceof Error` clause keeps it honest ("is this one of OUR thrown
  errors?", not "does any object carry this string?").
- **`AnyTsNukeError` union type** replaces the base type for callers that want
  the discriminated union (e.g. `switch (e._tag)`); the guard narrows to it.

### D3 — Dropped the `Object.setPrototypeOf(this, new.target.prototype)` line
Legacy `:18` restored the prototype chain across the **ES5** transpile boundary
(a well-known TS<ES2015 `extends Error` foot-gun). This slice targets **ES2022**
(`tsconfig.json`), where native `class extends Error` keeps the prototype intact,
and `Schema.TaggedError` handles its own prototype wiring. Verified: `instanceof
Error` is `true` for all five. No behavioral change — the line was a transpile
workaround, not domain logic.

---

## 3. What was NOT migrated (and why)

- **No `Effect<...>` wrapping.** These are error *values* thrown/returned by other
  slices, not effects. Wrapping them in fibers would be over-applying Effect and
  buys nothing; idiomatic `Schema.TaggedError` is the right granularity. Effect
  appears only as the tagged-error machinery.
- **No dead code in `errors.ts`** — every line is live, so nothing was dropped
  except the ES5 prototype-restore workaround (D3, no longer needed) and the
  single shared base class (D2, replaced by the tag set + union).
- **Consumers were not touched** (out of scope for this surgical slice). The two
  known consumers of RULE-037 errors are the discovery/engine (THROWS them → CLI
  exit 1) and `build-report.serializeError` (CONSUMES them → `report.ok = false`).
  See Follow-ups.
- **No new error tags / messages.** The five tags and the `(message, { cause })`
  construction shape are preserved verbatim so the throwing call-sites need no
  change at cutover.

---

## 4. Follow-ups for the next module(s) that depend on this one

1. **Discovery/engine slice (the THROWER):** when migrated onto this module, throw
   these classes with the unchanged `new X(message, { cause })` signature. Prefer
   the specific subclass (`ProjectNotFoundError`, `TsconfigNotFoundError`, …) so
   `_tag` carries the precise failure; `TsNukeError` is the catch-all base tag.
   If that slice is itself Effect-native it can `Effect.fail(new X(...))` /
   `yield* new X(...)` directly — `Schema.TaggedError` is designed for that.
2. **`build-report` slice (the CONSUMER) — KEEP `instanceof Error` + native `.cause`.**
   Its `serializeError` does `err instanceof Error`, reads `err.message`/`err.name`,
   and walks `err.cause` (root-last, each link `instanceof Error`). This slice
   guarantees all of that (verified). When migrating `serializeError`, it can keep
   the exact same `instanceof Error` + `.cause`-walk logic — **do not** switch it
   to a `_tag`-only check that would miss non-tsnuke `Error`s in the chain. If
   it ever wants to special-case tsnuke errors, use the exported
   `isTsNukeError` / `TSNUKE_ERROR_TAGS` rather than re-deriving the tag set.
3. **Replacing the `instanceof`-base habit:** any legacy call-site that did
   `if (e instanceof TsNukeError)` must move to `if (isTsNukeError(e))` (D2 —
   there is no shared base instance anymore). For exhaustive discrimination,
   `switch (e._tag)` over the `AnyTsNukeError` union is the idiomatic form.
4. **De-vendor the oracle:** `equivalence.test.ts` vendors a frozen copy of the
   legacy classes as the differential oracle. Once the legacy module is fully
   retired, that copy can be deleted along with the legacy source (the contract is
   also pinned directly in `errors.test.ts`).

---

## 5. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** is the command template's Java-ism, honored
  as written (mirrors the `score` slice). A more TS-idiomatic layout would
  co-locate `*.test.ts` beside sources; not changed, to respect the convention.
- **`.js` on relative specifiers** (`./Errors.js`, `../main/index.js`) under
  `Bundler` moduleResolution — same as `score`; the compiler resolves `.js` → `.ts`.
- **Guard ordering bug caught by the characterization tests:** the first guard
  draft read `value._tag` before the `instanceof Error` short-circuit, throwing on
  `null`/`undefined`. The negative-input test (`isTsNukeError(undefined)`) caught
  it; `instanceof Error` now guards first. (TDD working as intended.)
- **Barrel hygiene:** `index.ts` exports only the five classes, `isTsNukeError`,
  `TSNUKE_ERROR_TAGS`, and the `AnyTsNukeError` type. The internal
  `fields`/`buildProps` stay unexported — nothing consumers need.
- **Run:** `cd modernized/errors/effect && pnpm test` (vitest) · `pnpm typecheck` (tsc).

---

## 6. Equivalence summary (the proof)

`equivalence.test.ts` constructs paired legacy-oracle vs modern instances for all
five tags and asserts, per tag, that `_tag` / `name` / `message` / `instanceof
Error` / native `.cause` / guard result are **identical**; it also ports the exact
`serializeError` `.cause`-flatten loop and asserts a three-deep modern chain
yields the byte-identical `{ message, name, chain }` as the legacy chain. The ONE
representation difference — modern instances are not `instanceof` the legacy shared
base (D2) — is asserted explicitly as an intentional, known fact, immediately
alongside a re-assert that the contract guard still classifies the instance
correctly and that it remains `instanceof Error`.

---

## 7. Architecture review (consolidated, `architecture-critic`)

**No HIGH findings.** The critic independently ran `Schema.TaggedError` v3.21.2 and
confirmed the two load-bearing claims `build-report.serializeError` depends on:
`instanceof Error` is true, and a constructor `cause` lands on the **native** `.cause`
own-property (so the root-last chain walk works). It also grepped the repo and found
**zero** `instanceof TsNukeError` consumers, so dropping the shared base (D2) is not a
regression — `serializeError` only uses `instanceof Error` + native `.cause`.

**Applied:**
- **Drift guard added (MEDIUM).** `isTsNukeError` discriminates via `_tag` membership of
  `TSNUKE_ERROR_TAGS` (D2), a second source of truth that can silently diverge from the
  exported classes. `errors.test.ts` now asserts `TSNUKE_ERROR_TAGS.size === <#classes>`
  and that every class's tag is present, so adding a 6th error without updating the set
  fails CI.

**Recorded, no change:** the constructor-idiom NIT — this slice uses `new X(message, {cause})`
(legacy call shape) while `security`'s `InvalidGlobPatternError` uses the raw `new X({message})`
props form; both are `Schema.TaggedError`, so the framework idiom is consistent. Reconcile the
construction convention when these converge into a shared error package.

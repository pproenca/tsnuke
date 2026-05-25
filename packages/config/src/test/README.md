# Characterization tests — `config` sanitization module (Effect-TS target)

These tests **define "done"** for the Effect-TS rewrite of `ts-fix`'s PURE
config sanitization (`sanitizeConfig`). They were written *before* the
implementation. The implementation lives at `src/main/sanitize.ts` (imported as
`../main/index.js` — `.js` on relative specifiers, per the legacy convention; the
`Bundler` moduleResolution in `tsconfig.json` resolves `.js` to `.ts`). Until that
module exists the suite is **RED**, and that is the correct starting state.

The legacy module is the oracle (`legacy/ts-fix/packages/core/src/load-config.ts`,
read-only). We are proving *equivalence first* — and here, unlike the `score`
slice, there is **NO deliberate deviation**: `sanitizeConfig` is a faithful
behavior-preserving port. The only modernization is the *internal* idiom
(`effect/Schema` decode-with-fallback), which is non-observable.

## Scope: PURE core only

This slice transforms the **pure** `sanitizeConfig(raw: unknown)` (RULE-024) and
the `TsFixConfig` contract (RULE-040 vocab). The **filesystem loader**
(`loadConfig` / `loadConfigWithWarnings`, which `existsSync`/`readFileSync`) is
**DEFERRED** to the later effectful phase (`@effect/platform` FileSystem + Layers)
and is intentionally NOT implemented here. See `TRANSFORMATION_NOTES.md` §3.

## Rules under test

| Rule | What | File |
|------|------|------|
| RULE-024 | lenient config validation: never throws; non-object ignored (+warning unless `undefined`); each malformed field dropped with a verbatim warning; rest honored | `sanitizeConfig.test.ts`, `equivalence.test.ts` |
| RULE-040 | severity vocabulary: `failOn` uses engine vocab `"warning"`, `rules`/`categories` use config vocab `"warn"`; kept verbatim (NOT normalized here) | `vocabularyQuirk.test.ts`, `sanitizeConfig.test.ts` |
| RULE-039 | `plugins` retained as `string[]` if valid, but NEVER loaded | `sanitizeConfig.test.ts` |

## The vocabulary quirk (RULE-040) — preserved verbatim, NOT reconciled

`failOn` is valid with `"error" | "warning" | "none"` (the **engine** vocabulary);
`rules`/`categories` entries are valid with `"error" | "warn" | "off"` (the
**config** vocabulary). So `"warn"` is valid in `rules` but invalid in `failOn`,
and `"warning"` is valid in `failOn` but invalid in `rules`. `sanitizeConfig` keeps
the config vocab **verbatim** — the `warn`→`warning` normalization happens
downstream (legacy `index.ts`/`filter-pipeline.ts`; the filter-pipeline Effect
slice's `normalizeConfigSeverity`). `vocabularyQuirk.test.ts` pins this in
isolation because RULE-040 flags it as the contract's "vocabulary trap".

## How the equivalence proof works (`equivalence.test.ts`)

1. A **vendored, frozen copy** of the legacy `sanitizeConfig` (+ its helpers
   `isObject` / `isStringArray` / `sanitizeSeverityMap` / `sanitizeIgnore`,
   `load-config.ts:22-154`) is the oracle. Do NOT "improve" it.
2. A broad **hand-authored fixture set** covers nullish/non-object raw, each field
   valid + invalid, the vocab quirk, `plugins` retained, overrides good/bad,
   multi-drop accumulation, and full round-trips.
3. A **combinatorial fixture set** — the cartesian product of a few valid/invalid
   values per field (5·4·3·3·4·3 = **2160** fixtures) — exercises drop-set and
   warning-order interactions far beyond the hand set.
4. For every fixture: assert `modern` deep-equals `oracle` for BOTH `config` and
   `warnings` — **warning order included** (legacy field-traversal order:
   `ignore → failOn → customRulesOnly → plugins → rules → categories`).
5. A harness-sanity check asserts the fixtures actually exercise both warning and
   clean paths (so an all-equal pass isn't vacuous).

## Running

```sh
cd modernized/config/effect
./node_modules/.bin/vitest run          # all tests once
./node_modules/.bin/vitest              # watch mode
./node_modules/.bin/vitest run src/test/equivalence.test.ts   # just the proof
./node_modules/.bin/tsc --noEmit        # typecheck (strict + exactOptionalPropertyTypes)
```

Expect RED until `src/main/sanitize.ts` exists. Once implemented, all tests pass
with zero changes to these files.

## Public surface these tests expect (write the impl to match)

```ts
import {
  sanitizeConfig,           // (raw: unknown) => SanitizeResult  — PURE, never throws
  ConfigSeverity,           // Schema.Literal("error", "warn", "off")     — config vocab
  FailOn,                   // Schema.Literal("error", "warning", "none") — engine vocab
  TsFixConfig,           // Schema.Struct (full 6-field legacy contract)
} from "../main/index.js";
import type { SanitizeResult, TsFixConfig } from "../main/index.js";
```

- `SanitizeResult = { readonly config: TsFixConfig; readonly warnings: ReadonlyArray<string> }`.
- A config key is set **only** when its sanitized value is defined (no spurious
  `key: undefined` — `toStrictEqual` would catch it).

## Adding a new case

1. Add to `sanitizeConfig.test.ts` (per-field characterization) and — if it widens
   the proof — to the `handFixtures` array in `equivalence.test.ts`. Every
   `describe`/`it` block cites its `// RULE-NNN`.
2. Use literal inputs and literal expected outputs (full `{ config, warnings }`).
3. Assert warning **messages verbatim** and warning **order** — both are contract.
4. Behaviors not yet implemented in the target are marked
   `it.skip("pending RULE-NNN")` — never deleted. (The FS loader is recorded as a
   follow-up in `TRANSFORMATION_NOTES.md`, not as a skipped test, since it is out
   of this pure slice's scope.)
```

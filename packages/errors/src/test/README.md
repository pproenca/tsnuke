# Characterization tests — `errors` module (Effect-TS target)

These tests **define "done"** for the Effect-TS rewrite of `tsnuke`'s tagged
discovery error classes. They were written *before* the implementation. The
implementation lives at `src/main/index.ts` (imported as `../main/index.js` —
`.js` on relative specifiers, per the legacy convention; the `Bundler`
moduleResolution in `tsconfig.json` resolves `.js` to `.ts`). Until that module
exists the suite is **RED**, and that is the correct starting state.

The legacy module is the oracle (`legacy/tsnuke/packages/core/src/errors.ts`,
read-only). Legacy deliberately moved AWAY from Effect tagged errors to plain
`Error` subclasses with a `_tag` discriminant. The target stack is Effect, so we
move BACK to idiomatic `effect/Data` tagged errors (`Data.TaggedError`) — while
preserving the exact observable contract a downstream consumer depends on.

## Rule under test

| Rule | What | File |
|------|------|------|
| RULE-037 | Tagged discovery error classes: five discriminant tags `{TsNukeError, ProjectNotFoundError, NoTypeScriptProjectError, TsconfigNotFoundError, AmbiguousProjectError}` + `isTsNukeError` guard; propagate to CLI exit 1 / `serializeError` (`report.ok=false`), which flattens the `.cause` chain root-last | `errors.test.ts`, `equivalence.test.ts` |

## The downstream contract (why these tests are strict)

`build-report`'s `serializeError` (`legacy/.../build-report.ts:50-61`) does
`err instanceof Error`, reads `err.message` / `err.name`, and **walks
`err.cause`** (each link tested with `cause instanceof Error`), root-last. The
modern errors MUST therefore:

1. be `instanceof Error` (Effect's `Data.TaggedError` extends `Error` — verified);
2. carry the SAME `_tag` AND `name` strings as legacy (`"ProjectNotFoundError"`…);
3. set `cause` on the NATIVE `.cause` property, retrievable for the walk;
4. `isTsNukeError` → true for all five tags, false otherwise;
5. each carry a `message`.

All five are pinned in `errors.test.ts` and re-proven differentially against a
vendored legacy oracle in `equivalence.test.ts`.

## How the equivalence proof works (`equivalence.test.ts`)

1. A **vendored, frozen copy** of the legacy plain-`Error` classes (and its
   `instanceof`-based guard) serves as the oracle. Do not import from it or
   "fix" it.
2. **Paired factories** (legacy vs modern) for all five tags, constructed with
   the identical `(message, { cause })` shape, assert `_tag` / `name` / `message`
   / `instanceof Error` / native `.cause` / guard discrimination are **identical**.
3. The exact `serializeError` `.cause`-flatten loop is ported and run over both a
   legacy and a modern three-deep chain; the resulting `{ message, name, chain }`
   must be `toStrictEqual`.

### Where the representations legitimately differ (asserted, not hidden)

- **Class identity / shared base.** Legacy had one base class `TsNukeError` and
  every subclass was `instanceof TsNukeError`. The modern slice uses five
  **independent** `Data.TaggedError`s, because subclassing a single tagged base
  freezes `name` to the *base* tag (Effect derives `name` from the tag literal) —
  which would break contract #2. Cross-impl `instanceof` of the legacy base is
  therefore **not** preserved; one test asserts this divergence explicitly, and
  the guard is contract-based (`_tag` membership) instead of `instanceof`-based.
- **Extra Effect internals.** Modern instances carry Effect machinery (structural
  `Equal`, custom inspect). It's additive and invisible to `serializeError`, so
  the tests assert the *contract*, not deep structural equality of instances.

## Running

```sh
cd modernized/errors/effect
./node_modules/.bin/vitest run          # all tests once
./node_modules/.bin/vitest              # watch mode
./node_modules/.bin/vitest run src/test/equivalence.test.ts   # just the proof
```

Expect RED until `src/main/index.ts` exists. Once implemented, all tests must
pass with zero changes to these files.

## Public surface these tests expect (write the impl to match)

```ts
import {
  TsNukeError,             // class, _tag = name = "TsNukeError"
  ProjectNotFoundError,      // class, _tag = name = "ProjectNotFoundError"
  NoTypeScriptProjectError,  // class, _tag = name = "NoTypeScriptProjectError"
  TsconfigNotFoundError,     // class, _tag = name = "TsconfigNotFoundError"
  AmbiguousProjectError,     // class, _tag = name = "AmbiguousProjectError"
  isTsNukeError,           // (u: unknown) => u is AnyTsNukeError  (by _tag membership)
  TSNUKE_ERROR_TAGS,      // ReadonlySet<string> — the frozen 5-tag set the guard uses
} from "../main/index.js";
import type { AnyTsNukeError } from "../main/index.js";
```

- Each class constructs as `new X(message: string, options?: { cause?: unknown })`
  — the identical signature to legacy, so the discovery/engine slice that throws
  these needs no call-site change.
- `_tag` and `name` are BOTH the tag string (legacy parity).
- `cause` (when supplied) is the native `.cause` (walkable by `serializeError`).

## Adding a new case

1. Find the file for the behavior you're pinning. Every `describe`/`it` block
   must cite `RULE-037`.
2. Use literal inputs and literal expected outputs — no "should work".
3. Add the row to the shared `cases` / `pairs` tables so the new tag is exercised
   by every contract assertion uniformly.
4. If a behavior is not yet implemented, mark it `it.skip("pending RULE-037 …")`
   — never delete a characterization.

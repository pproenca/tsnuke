# Characterization tests — `exit-code` module (Effect-TS target)

These tests **define "done"** for the Effect-TS rewrite of `tsnuke`'s exit-code
gate (the CI pass/fail contract). They were written *before* the implementation.
The implementation lives at `src/main/index.ts` (imported as `../main/index.js` —
`.js` on relative specifiers, per the legacy convention; the `Bundler`
moduleResolution in `tsconfig.json` resolves `.js` to `.ts`). Until that module
exists the suite is **RED**, and that is the correct starting state.

The legacy module is the oracle (`legacy/tsnuke/packages/tsnuke/src/exit-code.ts`,
read-only). Unlike the `score` slice, the exit-code logic is a finite, discrete
decision with **no rounding subtleties**, so the proof asserts **100% equality**
(zero deviations) across the whole input space.

## Rules under test

| Rule | What | File |
|------|------|------|
| RULE-030 | gate: `none`→false; `warning`→true iff ANY diagnostic; `error`→true iff some `severity==="error"` | `shouldFailForDiagnostics.test.ts`, `equivalence.test.ts` |
| RULE-030 | resolver precedence: `hadError`→1; else `scoreMode`→0; else gate→`0\|1` | `resolveExitCode.test.ts`, `equivalence.test.ts` |
| RULE-031 | severity is `error \| warning` only — no `info` | encoded in the `Severity` input type throughout |

## No deviation from legacy (contrast with the `score` slice)

The `score` slice had one deliberate behavioral deviation (half-up → half-even
rounding). **This slice has none.** The gate is a pure boolean/literal decision;
the equivalence proof therefore asserts `modern === legacy` in **every** cell and
counts `diverged === 0`. The only behavioral "change" is at the *types* layer
(branded `ExitCode`, `Schema` literals for `FailOn`/`Severity`), which is wire-
and value-compatible (see TRANSFORMATION_NOTES.md §2).

## How the equivalence proof works (`equivalence.test.ts`)

1. A **vendored, frozen copy** of the legacy algorithm (`legacyShouldFailForDiagnostics`
   + `legacyResolveExitCode`, copied verbatim from `exit-code.ts:18-60`) serves as
   the oracle. Do not "fix" it.
2. The input space is **finite and small**, so it is enumerated **exhaustively** —
   no sampling:
   - `failOn` ∈ {`error`, `warning`, `none`} (3)
   - `diagnostics` ∈ {empty, warnings-only, has-error} (3 representative sets)
   - `scoreMode` ∈ {`true`, `false`} (2)
   - `hadError` ∈ {`true`, `false`, `undefined`} (3)
3. The **gate** is proven over the 3×3 (`failOn` × diagnostics) sub-grid = **9 cells**.
4. The **resolver** is proven over the full **3×3×2×3 = 54** cartesian product.
5. Each test counts its traversal (`compared === 9` / `=== 54`) and asserts
   `diverged === 0`, so an accidental empty grid cannot pass silently.

## Precedence traps pinned (`resolveExitCode.test.ts`)

- `hadError === true` beats `scoreMode` (a thrown run in `--score` mode still exits 1).
- `scoreMode` beats the gate (errors present + `--score` → still 0).
- `hadError` is optional; both `false` and `undefined` fall through to the next rule.

## Running

```sh
cd modernized/exit-code/effect
./node_modules/.bin/vitest run          # all tests once
./node_modules/.bin/vitest              # watch mode
./node_modules/.bin/vitest run src/test/equivalence.test.ts   # just the proof
```

Expect RED until `src/main/index.ts` exists. Once implemented, all tests must
pass with zero changes to these files.

## Public surface these tests expect (write the impl to match)

```ts
import {
  shouldFailForDiagnostics, // (diagnostics: readonly Pick<Diagnostic,"severity">[], failOn: FailOn) => boolean
  resolveExitCode,          // (inputs: ExitCodeInputs) => ExitCode (0 | 1)
} from "../main/index.js";
import type { FailOn, Severity, ExitCode, ExitCodeInputs } from "../main/index.js";
```

- `FailOn = "error" | "warning" | "none"`, default `"error"` (RULE-030).
- `Severity = "error" | "warning"` — no `info` (RULE-031).
- `ExitCode` is the branded literal `0 | 1`.
- `ExitCodeInputs = { diagnostics; failOn; scoreMode; hadError? }`; `diagnostics`
  needs only `{ severity: Severity }` per element.

## Adding a new case

1. Find the file for the function you're pinning. Every `describe`/`it` block
   cites its `// RULE-NNN`.
2. Use literal inputs and literal expected outputs — no "should work". State the
   decision in the test name, e.g. `"failOn warning + warnings-only -> true"`.
3. If you add an input axis, extend the cartesian enumeration in
   `equivalence.test.ts` AND update the `compared === N` count.
```

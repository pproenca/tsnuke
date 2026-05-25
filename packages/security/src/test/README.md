# Characterization tests — `security` module (Effect-TS target)

These tests **define "done"** for the Effect-TS rewrite of `ts-doctor`'s five pure
security guards. They were written *before* the implementation. The implementation
lives at `src/main/*.ts` (imported as `../main/index.js` — `.js` on relative
specifiers, per the legacy convention; the `Bundler` moduleResolution in
`tsconfig.json` resolves `.js` to `.ts`). Until that module exists the suite is
**RED**, and that is the correct starting state.

The legacy modules are the oracle
(`legacy/ts-doctor/packages/core/src/security/*.ts`, read-only). We are proving
*behavioral equivalence first*. Unlike the `score` slice there is **no deliberate
behavioral deviation** — the only change is structural (the glob error is now an
`effect/Data` tagged error, with its observable surface preserved).

## Rules under test

| Rule | What | File |
|------|------|------|
| RULE-014 / BC-17 | glob ReDoS caps: reject length > 1024 or `*`/`?` count > 24 (both caps exclusive; only `*`/`?` count) | `validateGlobPattern.test.ts`, `equivalence.test.ts` |
| RULE-027 / BC-15 | safe git revision: false on empty / leading `-` / leading-or-trailing `.` / `..` / `@{` / char outside `[A-Za-z0-9_./-]` | `isSafeGitRevision.test.ts`, `equivalence.test.ts` |
| RULE-027 / BC-19 | sanitizeEnv: strip `NODE_OPTIONS`, `NODE_DEBUG`, `npm_config_*`; pure (no mutation); keep the rest | `sanitizeEnv.test.ts`, `equivalence.test.ts` |
| RULE-027 / BC-16 | isInsideTempDir Zip-Slip: false for absolute / at-or-above tempDir; true for same-dir / nested | `isInsideTempDir.test.ts`, `equivalence.test.ts` |
| **RULE-039 (P0) / BC-18** | loadConfigPlugins ALWAYS returns `plugins: []`, never loads/resolves/requires/imports anything | `loadConfigPlugins.test.ts`, `equivalence.test.ts` |

## The one structural deviation from legacy: the glob error type

Legacy `glob.ts` defined `class InvalidGlobPatternError extends Error` by hand.
The modern module uses `Data.TaggedError("InvalidGlobPatternError")` from
`effect/Data` (idiomatic Effect). The **observable surface is preserved**:
`_tag === "InvalidGlobPatternError"`, `name === "InvalidGlobPatternError"`, a
message, and `instanceof Error`. The rejection PREDICATE (which inputs throw) is
byte-for-byte identical to legacy — proven in `equivalence.test.ts`.

## How the equivalence proof works (`equivalence.test.ts`)

A **vendored, frozen copy** of each legacy guard
(`legacy*` functions, copied verbatim from `legacy/.../security/*.ts`) serves as
the oracle. For each guard we enumerate boundary / representative inputs and
assert `modern === legacy`:

- `validateGlobPattern`: equivalence on the **throws/not** predicate across the
  length boundary (1023 / 1024 / 1025) and the wildcard boundary (24 / 25),
  including the "brackets/braces are not wildcards" case.
- `isSafeGitRevision`: equivalence on the returned boolean over every rejection
  branch + valid refs.
- `sanitizeEnv`: deep-equality of the sanitized env over enumerated envs.
- `isInsideTempDir`: equivalence on the returned boolean over tempDir/relPath
  pairs (same-dir, nested, `..` escapes, absolute).
- `loadConfigPlugins`: deep-equality of `{ plugins, ignored, warnings }`, plus
  the cardinal `plugins === []` assertion.

## The RULE-039 by-construction guard (`loadConfigPlugins.test.ts`)

Beyond the behavioral `plugins: []` checks, a **static source scan** reads every
file in `src/main/` and asserts it contains **none** of: `require(`,
`require.resolve`, dynamic `import(`, `eval(`, `new Function(`, the `Function(`
constructor call, `createRequire`, `process.binding`, `child_process`, `node:vm`.
If a future edit ever reintroduces a code-execution / module-resolution path, this
test fails — the P0 invariant is enforced at the source level, not just behaviorally.

## Running

```sh
cd modernized/security/effect
./node_modules/.bin/vitest run          # all tests once
./node_modules/.bin/vitest              # watch mode
./node_modules/.bin/vitest run src/test/equivalence.test.ts   # just the proof
```

Expect RED until `src/main/index.ts` exists. Once implemented, all tests pass
with zero changes to these files.

## Public surface these tests expect (write the impl to match)

```ts
import {
  MAX_GLOB_PATTERN_LENGTH,   // 1024 (FROZEN)
  MAX_GLOB_PATTERN_WILDCARDS,// 24   (FROZEN)
  InvalidGlobPatternError,   // effect/Data tagged error (_tag/name/message, instanceof Error)
  validateGlobPattern,       // (pattern: string) => void   throws on cap violation
  isSafeGitRevision,         // (ref: string) => boolean
  sanitizeEnv,               // (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv  (pure copy)
  isInsideTempDir,           // (tempDir: string, relPath: string) => boolean
  loadConfigPlugins,         // (config: TsDoctorConfig) => LoadConfigPluginsResult  ALWAYS plugins: []
} from "../main/index.js";
import type {
  TsDoctorConfig,
  LoadConfigPluginsResult,
  LoadedPlugin,           // = never (v1 produces no loaded plugins)
} from "../main/index.js";
```

- All five guards are **plain synchronous pure functions** — NOT `Effect<...>`-wrapped
  (Brief lines 25/91; the brief wires them at their sinks later, but the guards are pure).
- `loadConfigPlugins` ALWAYS returns `{ plugins: [], ignored, warnings }`.

## Adding a new case

1. Find the file for the guard you're pinning (or add `<fn>.test.ts`). Every
   `describe`/`it` block cites its `RULE-NNN` / `BC-NN`.
2. Use literal inputs and literal expected outputs — state the boundary in the
   test name (e.g. `"accepts a pattern with exactly 24 wildcards (at the cap)"`).
3. For any new `src/main/` source, the RULE-039 source scan auto-covers it (it
   `readdirSync`s the whole `main/` directory) — keep the file free of the
   forbidden code-execution tokens.
4. Behaviors not yet implemented in the target are marked
   `it.skip("pending RULE-NNN")` — never deleted.
```

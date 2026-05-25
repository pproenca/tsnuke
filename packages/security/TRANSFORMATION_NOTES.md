# Transformation Notes — `security` → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform ts-doctor security effect`.
Source (READ-ONLY): `legacy/ts-doctor/packages/core/src/security/{index,glob,git-revision,env,staged-files,plugins}.ts`
(+ the `plugins` field of the `TsDoctorConfig` contract from `packages/core/src/types.ts:151-164`).
Target: `modernized/security/effect/` (package `@ts-doctor/security-effect`).

Implements **RULE-014** (glob ReDoS caps), **RULE-027** (the five dormant guards),
and **RULE-039** (config `plugins` never loaded — the P0 RCE-by-construction
invariant). Verified by 70 characterization tests including a 5-guard differential
equivalence proof against vendored frozen legacy oracles.

**Result:** 70/70 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.

**RULE-039 confirmation:** `loadConfigPlugins` has **zero code-execution paths** —
it always returns `{ plugins: [], ignored, warnings }` and contains no
`require` / dynamic `import()` / `eval` / `Function` constructor / module-resolution
call. Enforced behaviorally AND by a static source-scan test over all of `src/main/`.

---

## 1. Mapping table (legacy → target, per guard)

| Behavior | Legacy `security/*` | Target |
|----------|---------------------|--------|
| Barrel re-exporting the 5 guards | `index.ts:8-21` | `src/main/index.ts` |
| Frozen caps `1024` / `24` (RULE-014/041) | `glob.ts:13-15` | `src/main/Glob.ts:24-26` |
| `validateGlobPattern` (RULE-014/BC-17) | `glob.ts:32-47` | `src/main/Glob.ts:55-72` |
| `InvalidGlobPatternError` (BC-17) | `glob.ts:18-25` (`class extends Error`) | `src/main/Glob.ts:38-45` (`Schema.TaggedError`) — see **D1** |
| `isSafeGitRevision` (RULE-027/BC-15) | `git-revision.ts:17-28` | `src/main/GitRevision.ts:25-33` (verbatim) |
| `sanitizeEnv` (RULE-027/BC-19) | `env.ts:13-29` | `src/main/Env.ts:19-32` (verbatim) |
| `isInsideTempDir` (RULE-027/BC-16) | `staged-files.ts:12-37` | `src/main/StagedFiles.ts:21-39` (verbatim) |
| `loadConfigPlugins` (RULE-039/BC-18) | `plugins.ts:41-52` | `src/main/Plugins.ts:50-61` (verbatim, no load path) |
| `LoadConfigPluginsResult` / `LoadedPlugin` | `plugins.ts:22-32` | `src/main/Plugins.ts:30-38` (fields made `readonly`) |
| `TsDoctorConfig.plugins` (BC-22) | `types.ts:151-164` (full struct) | `src/main/Config.ts` (re-exports canonical `TsDoctorConfig` from `@ts-doctor/contracts-effect`; bare local interface DELETED) — see **D3** |

Four of the five guards (`isSafeGitRevision`, `sanitizeEnv`, `isInsideTempDir`,
`loadConfigPlugins`) are copied **verbatim** — they are domain-agnostic and
already pure. The only code change is in `Glob.ts` (the error type, **D1**).

---

## 2. Deliberate deviations from legacy behavior

### D1 — `InvalidGlobPatternError`: hand-rolled `class` → `effect/Schema` tagged error (structural, idiomatic)
Legacy `glob.ts:18-25` defined `class InvalidGlobPatternError extends Error` with a
manual `_tag` field, `this.name = …`, and `Object.setPrototypeOf`. This module uses
`Schema.TaggedError<InvalidGlobPatternError>()("InvalidGlobPatternError", { message: Schema.String })` from `effect/Schema`
(`Glob.ts:38`) — the Effect-native tagged error, ready for the typed error channel /
`Effect.catchTag` when the guard is wired at its sink.

- **Behavioral equivalence:** the rejection PREDICATE is unchanged — the same inputs
  throw, the same inputs pass. Proven byte-for-byte in `equivalence.test.ts` against a
  frozen legacy oracle (throws-iff-throws across both cap boundaries).
- **Observable surface preserved:** `_tag === "InvalidGlobPatternError"`,
  `name === "InvalidGlobPatternError"`, a non-empty `message` (same wording as legacy,
  including the offending count and the cap), and `instanceof Error` all hold —
  asserted in `validateGlobPattern.test.ts`.
- **Throwing contract kept:** `validateGlobPattern` still `throw`s (returns `void`),
  NOT an `Either`/`Effect`. The brief wires it at the glob-compiler sink later; the
  guard itself stays a plain synchronous pure function (Brief lines 25/91).
- **NOT over-applied:** the frozen caps stay plain `const number`s (not `Schema`/branded).
  Barrel hygiene preserved; Effect appears only where it is idiomatic (the tagged error).

### D2 — result types narrowed to `readonly` (type tightening, no behavior change)
`LoadConfigPluginsResult` fields are `ReadonlyArray<…>` (legacy used mutable arrays),
and `TsDoctorConfig.plugins` is `readonly string[]`. Values are identical; this only
prevents accidental downstream mutation of the guard's output.

### D3 — `TsDoctorConfig` DE-VENDORED to `@ts-doctor/contracts-effect`
The legacy `TsDoctorConfig` (`types.ts:151-164`) is a large struct; the only field any
guard in this slice reads is `plugins`. This slice previously vendored a bare
`interface { plugins?: readonly string[] }`; that local interface is now DELETED and
`Config.ts` re-exports the canonical `TsDoctorConfig` from `@ts-doctor/contracts-effect`.
The canonical struct is a structural SUPERSET that includes
`plugins?: readonly string[]`, so `loadConfigPlugins(config: TsDoctorConfig)` reads
`config.plugins` byte-identically — RULE-039 behavior unchanged (still returns
`{ plugins: [], ignored, warnings }`, never loads anything).

---

## 3. What was NOT migrated (and why)

- **The guards stayed plain, synchronous, pure functions — NOT `Effect`-wrapped.**
  Deliberate (Brief lines 25/91): these are pure CPU predicates with no IO; wrapping
  them in fibers buys nothing. The brief wires them into `Effect` *at their sinks*
  (the subprocess / glob / extraction code paths), not in the guards themselves. The
  Effect ecosystem appears only in the idiomatic `Schema.TaggedError` (D1).
- **No dead code in the legacy guards** — every line is live (the guards are correct,
  just dormant per RULE-027), so nothing was dropped. Legacy's manual prototype
  plumbing in `InvalidGlobPatternError` is the only thing "removed", replaced per D1.
- **No plugin-loading path was added (and never must be).** RULE-039 is the *absence*
  of behavior; there is deliberately nothing to migrate INTO. See Follow-up #4.
- **The full `TsDoctorConfig` struct** is no longer vendored at all — `Config.ts` now
  re-exports the canonical `TsDoctorConfig` from `@ts-doctor/contracts-effect` (D3).
  This slice still reads only the `plugins` field; the other fields (`ignore`, `failOn`,
  `rules`, …) are simply present-but-unread.
- **Sinks were not touched** (out of scope for this surgical slice): the guards are
  still DORMANT (RULE-027). Wiring them at the diff / staged / glob / subprocess sinks
  is the explicit Follow-up #1 — those sinks do not exist yet.

---

## 4. Follow-ups for the next module(s) that depend on this one

1. **Wire each DORMANT guard at its real sink (RULE-027) — the headline follow-up.**
   All five guards are correct but currently called by NOTHING (dormancy confirmed by
   grep in the assessment). When the corresponding sinks land, call the guard there and
   **assert invocation in an integration test** so the guard cannot be silently bypassed:
   - `isSafeGitRevision` → the `--diff <base>` git-subprocess path (validate the ref
     before spawning git).
   - `isInsideTempDir` → the staged-file extraction path (check each materialized path
     before writing under the temp dir).
   - `validateGlobPattern` → the glob → `RegExp` compiler (validate before compiling).
   - `sanitizeEnv` → every subprocess spawn (pass the sanitized env, array-arg, no shell).
   - `loadConfigPlugins` → config load (call it, surface `warnings`, and — see #4 —
     keep `plugins` always `[]`).
2. **De-vendor `TsDoctorConfig` (D3) — DONE.** The bare local
   `interface { plugins?: readonly string[] }` in `Config.ts` was DELETED; the file now
   re-exports the canonical `TsDoctorConfig` from `@ts-doctor/contracts-effect` (a proven
   structural superset that keeps `plugins?: readonly string[]` "present only so it can be
   warned about", BC-22). Added the `@ts-doctor/contracts-effect": file:../../contracts/effect`
   dep + `vitest.config.ts` `server.deps.inline` entry. `loadConfigPlugins` reads only
   `config.plugins`; RULE-039 behavior is byte-identical. Suite stayed green (70/70,
   incl. the by-construction source-scan over `Config.ts`) with no assertion change.
3. **`InvalidGlobPatternError` typed-error channel (D1):** when `validateGlobPattern` is
   wired into an `Effect` at the glob sink, prefer `Effect.try`/`catchTag` over a raw
   `try/catch` — the `Schema.TaggedError` already carries the `_tag` for `catchTag`.
4. **RULE-039 must NEVER gain a plugin-loading path (P0).** Do not add
   `require`/`import()`/`eval`/`Function`/module-resolution against scanned-repo paths
   anywhere. Any future opt-in must resolve bare npm names from the **tool's own**
   `node_modules` behind an explicit `--allow-plugins` flag — never from the scanned
   repo — and belongs in a separate, reviewed slice with its own trust model. The
   source-scan test in `loadConfigPlugins.test.ts` will fail if a forbidden token
   reappears in `src/main/`; keep it.

---

## 5. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout** is the command template's Java-ism, honored as
  written (matches the `score` slice). A more TS-idiomatic layout would co-locate
  `*.test.ts` beside sources; not changed, to respect the explicit instruction.
- **One file per guard** (`Glob.ts`, `GitRevision.ts`, `Env.ts`, `StagedFiles.ts`,
  `Plugins.ts`) + `Config.ts` for the vendored contract + `index.ts` barrel. Mirrors
  the legacy file split so the mapping table is 1:1.
- **`.js` relative specifiers** on every import (e.g. `./Glob.js`), per the legacy
  convention; `Bundler` moduleResolution resolves `.js` → `.ts`.
- **`pnpm-workspace.yaml` `allowBuilds: { esbuild: true }`** so pnpm 11 runs esbuild's
  install script (vitest needs esbuild). Same versions as the `score` slice:
  `effect@^3.21.2`, `vitest@^3.2.0`, `typescript@^5.8.0`, `@types/node@^22.10.0`.
- **Run:** `cd modernized/security/effect && pnpm test` (vitest) · `pnpm typecheck` (tsc).

---

## 6. Test inventory (70 tests)

| File | Tests | Covers |
|------|-------|--------|
| `validateGlobPattern.test.ts` | 15 | frozen caps, at/over boundary for length AND wildcard count, only `*`/`?` counted, error surface (`_tag`/`name`/`instanceof Error`/message) |
| `isSafeGitRevision.test.ts` | 18 | each rejection branch in isolation + valid refs |
| `sanitizeEnv.test.ts` | 6 | strips exact keys + prefix, keeps similar names, no mutation, distinct copy |
| `isInsideTempDir.test.ts` | 11 | same-dir allow, nested allow, `..` escapes reject, absolute reject |
| `loadConfigPlugins.test.ts` | 15 | always `plugins: []` for any input + **static source scan**: no `require`/`import(`/`eval`/`Function(`/resolve in any `src/main/` file (RULE-039 by-construction) |
| `equivalence.test.ts` | 5 | differential proof vs vendored frozen legacy oracles for all 5 guards |

---

## 7. Architecture review (consolidated, `architecture-critic`)

**No HIGH findings.** The critic independently grepped `src/main/` for `require(` / `import(` /
`eval` / `Function(` / `createRequire` / `child_process` / `vm` / `.resolve(` — **zero**
code-execution paths (the one `resolve` import is `node:path.resolve`, pure string math).
RULE-039 RCE-by-construction holds.

**Applied:**
- **Fixed a mislabeled RULE-039 scan entry (MEDIUM).** In `loadConfigPlugins.test.ts` the
  entry labelled `".resolve( (module resolution)"` actually matched `createRequire` — so the
  P0 by-construction scan did NOT cover `.resolve(` despite claiming to. Split into a correct
  `createRequire` entry plus real `\.resolve\s*\(` and `import.meta.resolve` patterns (the
  legit bare `resolve(` from `node:path` has no leading dot, so it does not false-positive).

**Recorded, no change (LOW):**
- `isInsideTempDir` carries a redundant-for-parity branch (`rel.length === 0` is unreachable
  after the `target === base` early return) — kept verbatim from the frozen-from-react-doctor
  source; tidying it risks changing semantics.
- `sanitizeEnv` copies keys whose value is literally `undefined` (legitimate for
  `ProcessEnv`); matches the oracle, but the env fixtures don't include an `undefined`-valued
  key, so that exact corner is unproven.
- **RULE-027 dormancy** is correctly the headline follow-up: all 5 guards are pure and have no
  live caller; wire each at its real sink (diff/staged/glob/subprocess) and assert invocation
  in an integration test when those land.

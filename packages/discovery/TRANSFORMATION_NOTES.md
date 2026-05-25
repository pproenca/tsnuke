# Transformation Notes — `discovery` (project discovery + capability earning) → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform ts-doctor discovery effect`.
Source (READ-ONLY): `legacy/ts-doctor/packages/core/src/discover-ts-project.ts:1-442`
(the **largest** core module) — the strict-flag family, the lenient-JSON / `extends`
helpers, the source-file walkers, the version/module/build/kind detectors,
`discoverTsProject`, and `computeCapabilities` — plus the `ProjectInfo` type
(`packages/core/src/types.ts:22-51`) and the `Capability` alias
(`packages/ts-doctor-rules/src/types.ts:72`). Target:
`modernized/discovery/effect/` (package `@ts-doctor/discovery-effect`).

Implements three rules **end-to-end**:
- **RULE-012** (source-file discovery caps): `countSourceFiles` (cap 5000) /
  `collectSourceFiles` (cap 10000) — **EFFECTFUL** fs walks over `@effect/platform`
  `FileSystem` (error channel `never`).
- **RULE-022** (project discovery validity): `discoverTsProject` — **EFFECTFUL** over
  `FileSystem` + `Path`; the legacy `throw`s become the Effect **error channel**
  (`TsconfigNotFoundError` / `NoTypeScriptProjectError`, imported from
  `@ts-doctor/errors-effect` via a `file:` dep); a broken `package.json` stays a success
  with defaults.
- **RULE-021** (capability token earning): `computeCapabilities` — a **PURE** synchronous
  derivation over `ProjectInfo` (NOT Effect-wrapped).

This is the SECOND genuinely-effectful slice. It REUSES the `config` slice's
Layer/service pattern (`@effect/platform` `FileSystem` + `Path`, `NodeContext` in prod,
in-memory stub Layer in tests) — extended for `readDirectory` + `stat`.

Verified by **104** tests (16 enumeration + 39 discovery + 25 capabilities + 20
equivalence + 4 production-Layer smoke), almost all on a stub in-memory FileSystem Layer
(NO real disk), plus the 4 smoke tests against an OS temp dir.

**Result:** 104/104 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. The `@ts-doctor/errors-effect`
`file:` dep resolved and its `Data.TaggedError`s feed the Effect error channel; the prod
`NodeContext` Layer reads real disk.

---

## 1. Mapping table (legacy → target, per behavior)

| Behavior | Legacy `discover-ts-project.ts` | Target |
|----------|----------------------------------|--------|
| `ProjectInfo` contract | `types.ts:22-51` (`interface`) | `src/main/ProjectInfo.ts` (`effect/Schema`: `ProjectInfo`, `ProjectKind`, `ModuleSystem`, `BuildTool`) |
| `Capability` alias | `ts-doctor-rules/src/types.ts:72` (`type = string`) | `src/main/capabilities.ts` `Capability` (`= string`, parity) |
| `STRICT_FLAGS` (15-member family, RULE-021) | `:24-40` | `src/main/discover.ts` `STRICT_FLAGS` (verbatim, order preserved) |
| `readJsonFile` (lenient parse: strip comments + trailing commas) | `:47-56` | `src/main/discover.ts` `readJsonFile` — `fs.readFileString` + same regex strip + `Either.try(JSON.parse)`; read-fail OR parse-fail → `undefined` (error channel `never`) |
| `isObject` guard | `:58-60` | `src/main/discover.ts` `isObject` (kept hand-rolled — see D2) |
| `readTsconfig` (one-level `extends` shallow merge) | `:67-96` | `src/main/discover.ts` `readTsconfig` — `Effect.gen`; child wins; broken parent → self |
| `resolveExtends` (relative/absolute/bare) | `:99-108` | `src/main/discover.ts` `resolveExtends` — pure `Path`-service string math |
| `countSourceFiles` (cap 5000; count ignore-set) | `:111-153` | `src/main/enumerate.ts` `countSourceFiles` — `Effect<number, never, FileSystem>`, iterative DFS |
| `SOURCE_SCAN_IGNORED_DIRS` (collect ignore-set) | `:156-166` | `src/main/enumerate.ts` `SOURCE_SCAN_IGNORED_DIRS` (verbatim, the larger set) |
| `collectSourceFiles` (cap 10000; +dot-skip) | `:174-207` | `src/main/enumerate.ts` `collectSourceFiles` — `Effect<ReadonlyArray<string>, never, FileSystem>` |
| `resolveTsVersion` (installed > declared range) | `:210-234` | `src/main/discover.ts` `resolveTsVersion` — `Effect`, same precedence + regex |
| `hasTypeScript` (installed OR declared) | `:237-246` | `src/main/discover.ts` `hasTypeScript` — `Effect` |
| `detectModuleSystem` (pure) | `:248-265` | `src/main/discover.ts` `detectModuleSystem` (PURE, verbatim) |
| `detectBuildTool` (deps/scripts/config files, precedence) | `:267-295` | `src/main/discover.ts` `detectBuildTool` — `Effect` (config-file `exists` is I/O) |
| `detectProjectKind` (monorepo/lib/app/unknown heuristics) | `:297-320` | `src/main/discover.ts` `detectProjectKind` — `Effect` |
| `discoverTsProject` (validity + assembly, RULE-022) | `:329-388` | `src/main/discover.ts` `discoverTsProject` — `Effect<ProjectInfo, …, FileSystem \| Path>`; `throw` → `Effect.fail` |
| `moduleResolutionToken` | `:391-398` | `src/main/capabilities.ts` `moduleResolutionToken` (verbatim) |
| `computeCapabilities` (RULE-021) | `:416-442` | `src/main/capabilities.ts` `computeCapabilities` (PURE, verbatim) |
| `existsSync`/`readFileSync` (`node:fs`) | `:14` | `@effect/platform` `FileSystem.exists` / `.readFileString` (service) |
| `readdirSync`/`statSync` (`node:fs`) | `:14` | `@effect/platform` `FileSystem.readDirectory` / `.stat` (service) |
| `resolve`/`join`/`dirname`/`basename`/`isAbsolute` (`node:path`) | `:15` | `@effect/platform` `Path.*` (service) in `discover.ts`; a `FileSystem`-only POSIX join in `enumerate.ts` (see D3) |
| production fs wiring | (ambient `node:fs`/`node:path`) | `src/main/node.ts` `NodeContext = Layer.merge(NodeFileSystem.layer, NodePath.layer)` + `discoverTsProjectNode` / `countSourceFilesNode` / `collectSourceFilesNode` |

No dead code dropped — every function in legacy `discover-ts-project.ts` is migrated and
live (`collectSourceFiles` is exported even though the legacy in-tree caller is `diagnose`,
out of this slice's scope — kept for parity).

---

## 2. Deviations from legacy behavior

**Byte-for-byte equivalent across the covered fixture classes; the deviations below
are all idiom / type-level / non-observable.** The differential (`equivalence.test.ts`)
asserts the modern result deep-equals the frozen legacy oracle (success ProjectInfo +
capability set; or failure tag + verbatim message) across every crafted fixture — **0
divergences**. **Known coverage limits (architecture review H1/H2, honestly enumerated):**
the differential fixtures stay under the caps, so the order-sensitive cap-TRUNCATION path
is pinned separately by `enumerate.test.ts` (`cap truncation`, small injected cap) + a
REAL-readdir test in `node.test.ts` rather than by the oracle; symlinked dirs and
non-POSIX (Windows) paths are NOT differentially covered (the slice's deployment contract
is POSIX, see D3). "0 divergences" therefore means "over the covered classes," not "over
all conceivable inputs."

### D1 — `throw` → Effect ERROR CHANNEL (the headline idiom)
Legacy `discoverTsProject` `throw`s `TsconfigNotFoundError` / `NoTypeScriptProjectError`.
The target returns `Effect<ProjectInfo, TsconfigNotFoundError | NoTypeScriptProjectError,
FileSystem | Path>` and `Effect.fail`s those typed errors on the **error channel** — the
idiomatic Effect replacement for `throw`. The errors are the `effect/Data` tagged errors
from `@ts-doctor/errors-effect` (a `file:../../errors/effect` dep), so they carry the same
`_tag` / `name` / verbatim message the CLI + `serializeError` consume (RULE-037). The
error MESSAGES (`No tsconfig.json found in ${root}. …`, `No resolvable 'typescript'
dependency and no .ts/.tsx sources found in ${root}.`) are reproduced verbatim, with the
SAME `${root}` (resolved) format. NON-fatal cases (broken/unreadable/non-object
`package.json`) stay **successes with defaults** (`pkg = {}`), exactly as legacy continued
past its `try/catch`.

### D2 — `isObject` kept hand-rolled (deliberate, non-observable)
The "plain object" check (`typeof === "object" && !== null && !Array.isArray`) is NOT a
Schema. Legacy's "an array is NOT a config object / NOT compilerOptions" behavior is a
structural predicate; routing it through `Schema.Object`/`Schema.Record` risks drifting the
exact accept/reject set (arrays are handled differently). Kept verbatim from legacy `:58-60`
(same rationale as the config slice's D2).

### D3 — `enumerate.ts` joins paths WITHOUT the `Path` service (FileSystem-only channel)
Per the slice contract the two walkers are `Effect<…, never, FileSystem>` (no `Path`
requirement). Legacy used `node:path` `join`/`resolve`. The walkers join with a single
`"/"` separator (`joinPath`). For the **absolute, normalized** directory keys these walks
produce (no `..`/`.` segments survive — collect skips dot-entries, both skip noise dirs,
and `discover.ts` passes an already-`Path.resolve`d `root`), this is byte-identical to
`node:path.join` on the POSIX prod host and the in-memory test FS. `discover.ts` (which
must resolve a user-supplied `dir` and `extends` targets where full `node:path` semantics
matter) DOES use the `Path` service. The equivalence oracle uses real `node:path` (posix)
and a guard pins it reproduces the modern probed paths, so D3 is proven safe.

### D4 — `computeCapabilities` stays a PURE synchronous function (NOT Effect-wrapped)
Deliberate, matching the established pure-slice pattern (`score`, `sanitize`). It is a pure
derivation over `ProjectInfo` (no I/O) — wrapping it in a fiber would buy nothing. The
load-bearing inversion (an OFF strict flag emits NO token, driving RULE-020) is preserved
exactly: only flags recorded `true` in `info.strictFlags` add a token.

### D5 — `ProjectInfo` modeled as `effect/Schema` (was a bare `interface`)
`src/main/ProjectInfo.ts` is a `Schema.Struct` (+ `ProjectKind`/`ModuleSystem`/`BuildTool`
literals), giving callers a single runtime decode gate. Discovery builds a typed value
directly (no decode on the hot path) and `computeCapabilities` accepts an already-typed
value — same fast-path convention as `score`'s `Diagnostic`/`computeScore`. Purely a
contract upgrade; the runtime shape is identical (`toStrictEqual` vs the oracle's
interface-typed value passes).

---

## 3. The effectful shape (error channels + Layers)

```
discoverTsProject(dir):   Effect<ProjectInfo, TsconfigNotFoundError | NoTypeScriptProjectError, FileSystem | Path>
countSourceFiles(root):   Effect<number,                 never, FileSystem>
collectSourceFiles(root): Effect<ReadonlyArray<string>,  never, FileSystem>
computeCapabilities(info): Set<Capability>   // PURE, sync — no Effect
```

- **Requirements channel** declares the `@effect/platform` services each function needs
  (`FileSystem`, and `Path` for discovery). No `node:fs`/`node:path` import in the logic —
  satisfied by a Layer at the edge.
- **Enumeration error channel is `never`** (RULE-012): legacy's `try { readdirSync /
  statSync } catch { continue }` becomes `Effect.orElseSucceed` — a `readDirectory`
  `PlatformError` (unreadable dir) → `[]` (skip the dir); a `stat` `PlatformError`
  (failed stat) → an `undefined` sentinel (skip the entry). Truncation at the cap is silent
  (a 5001-file repo reports 5000) — preserved. The walk NEVER fails out.
- **Discovery error channel** carries ONLY the two validity errors (RULE-022). Every other
  `PlatformError` is absorbed: `fs.exists` fail → "absent" (`orElseSucceed(() => false)`);
  `readJsonFile` read/parse fail → `undefined` → the relevant default (`{}` tsconfig,
  default `pkg`). So discovery fails ONLY when it MEANS to (no tsconfig / not a TS project).

### The Layer pattern (two implementations of the same services)
- **Production** — `src/main/node.ts`: `NodeContext = Layer.merge(NodeFileSystem.layer,
  NodePath.layer)` from `@effect/platform-node` (the ONLY module referencing it). Runnable
  helpers `discoverTsProjectNode` (may REJECT with the typed error via `runPromise`),
  `countSourceFilesNode` / `collectSourceFilesNode` (NEVER reject — channel `never`).
- **Tests** — `src/test/stubFs.ts`: an in-memory `FileSystem.layerNoop` over a
  `Map<absolutePath, FileNode>` (file / dir / unreadable), overriding the four ops the
  logic calls (`exists`, `readFileString`, `readDirectory`, `stat`); missing/unreadable
  paths fail with a real `SystemError` so the `PlatformError → skip/default` mappings are
  genuinely exercised. `Path` is the REAL `Path.layer` (pure string math → proves
  path-joining matches `node:path`). Both prod and tests satisfy the same `FileSystem |
  Path` requirement, so swapping disk for the in-memory map is a one-line Layer change.

---

## 4. What was NOT migrated / follow-ups

1. **`typecheckOk` stays HARDCODED `false` (PENDING — RULE-021 suspected defect, PRESERVED).**
   Discovery does NOT type-check; it emits `typecheckOk: false`, so `computeCapabilities`
   NEVER emits `"typecheck:ok"` on a discovery-produced `ProjectInfo`. The **engine**
   reconciles the real value from a `ts.Program` (RULE-018). This is preserved deliberately
   — do NOT compute typecheck here. **Follow-up:** the engine slice must set the real
   `typecheckOk` (and the `capsForTyp` skip-accounting synthetic token) BEFORE gating
   Tier-2; a caller computing capabilities WITHOUT going through `runEngine` would never
   open Tier-2 (the RULE-021 SME note).

2. **RULE-012 inconsistency PRESERVED + flagged for reconciliation (suspected defect).**
   The count and collect scans use TWO different caps (5000 vs 10000) AND TWO different
   ignore-dir sets (collect adds `.next` + `storybook-static`, and collect alone skips
   dot-entries). This is reproduced verbatim and pinned side-by-side in
   `enumerate.test.ts` ("RULE-012 quirk"). It is almost certainly an accidental drift, not
   a designed difference. **Follow-up:** reconcile to one cap + one ignore set when the
   walkers are unified (likely in the engine/diagnose slice that owns the full-tree scan).

3. **`computeCapabilities` GATES which rules run → the score (load-bearing, RULE-020).**
   An OFF strict flag emits NO token, which is what fires the inverted-gating `enable-X`
   CFG rules. **Follow-up / rewrite trap:** the rules slice (and any engine planner) must
   keep treating a MISSING token as "flag is OFF" — defaulting a missing flag to "on" would
   invert RULE-020 and silently change the score. The equivalence proof pins the token set
   per fixture so a drift here is caught.

4. **`ProjectInfo` ownership (de-vendor target).** This slice OWNS `ProjectInfo` (it is the
   sole producer and not yet duplicated). The architecture review's cross-cutting note
   (config TRANSFORMATION_NOTES §7a) recommends a shared `@ts-doctor/contracts-effect`
   package; if it lands, this `ProjectInfo` Schema is the canonical source to de-vendor
   onto. `Capability` de-vendor: **DONE** — the local bare `type Capability = string`
   alias in `src/main/capabilities.ts` was DELETED and replaced with a type-only import
   of the canonical `Capability` from `@ts-doctor/contracts-effect` (`Schema.String`,
   `.Type === string` — structurally identical). Suite stayed green (109/109). `ProjectInfo`
   remains slice-owned (out of scope this pass).

5. **`collectSourceFiles` consumer out of scope.** Legacy `collectSourceFiles` is called by
   `diagnose()` (full-tree scan when no diff/staged include set). That orchestration is a
   later slice; the function is migrated + tested here so it is ready to wire.

---

## 5. Toolchain / housekeeping notes

- **`src/main` + `src/test` layout**, **`.js` relative specifiers** (resolved `.js`→`.ts`
  by `Bundler` moduleResolution), **`pnpm-workspace.yaml` `allowBuilds: { esbuild: true }`**
  — all honored as written, consistent with the `config`/`score`/`errors` slices.
- **Pinned toolchain:** `effect@^3.21.2`, `vitest@^3.2.0`, `typescript@^5.8.0`,
  `@types/node@^22.10.0`. ESM (`"type": "module"`).
- **Effectful-slice deps:** `@effect/platform@^0.96.1` (the `FileSystem`/`Path` service
  interfaces — runtime `dependency`), `@effect/platform-node@^0.106.0` (the prod
  `NodeFileSystem`/`NodePath` Layers — `dependency`, referenced ONLY in `node.ts`'s
  `NodeContext`), and `@effect/vitest@^0.29.0` (devDep). Versions resolved via `npm view`
  against `effect@^3.21.2` (peer `effect: ^3.21.x`), matching the `config` slice exactly so
  they resolve to the same store entries.
- **`file:` dependency on the errors slice:** `"@ts-doctor/errors-effect":
  "file:../../errors/effect"`. `pnpm install` symlinks it; `tsc` resolves its `.ts`
  types and `vitest` runs against them across the symlink. The five `Data.TaggedError`s
  feed the Effect error channel directly (D1) — **the `file:` dep + the error-channel
  wiring both work** (asserted in `discover.test.ts` / `equivalence.test.ts` /
  `node.test.ts`).
- **Ignored native builds (harmless):** `@effect/platform-node` pulls optional transitive
  `@parcel/watcher` + `msgpackr-extract`, whose install scripts pnpm 11 skips
  (`ERR_PNPM_IGNORED_BUILDS`). NEITHER is used by `NodeFileSystem`/`NodePath`, so the skip
  is harmless (same as the `config` slice — no `pnpm approve-builds` required). NOTE:
  pnpm's pre-script `runDepsStatusCheck` logs this warning when invoking `pnpm test` /
  `pnpm typecheck`; the scripts still complete (exit 0). The authoritative green check is
  the direct binary: `./node_modules/.bin/tsc --noEmit` + `./node_modules/.bin/vitest run`.
- **Run:** `cd modernized/discovery/effect` then `./node_modules/.bin/vitest run` (104
  tests) · `./node_modules/.bin/tsc --noEmit`.

---

## 6. Equivalence proof summary

- **Oracle:** vendored frozen copy of legacy `discover-ts-project.ts:24-442` (all helpers +
  `discoverTsProject` + `computeCapabilities`) in `src/test/equivalence.test.ts`,
  parameterized over a fake `{ existsSync, readFileSync, readdirSync, statSync }` backed by
  the SAME in-memory tree the modern stub Layer reads. Read-only intent — it reproduces
  legacy, it is not "fixed".
- **Fixtures:** 16 crafted project trees spanning monorepo / app / lib / unknown; all-15
  strict flags ON; non-`true` strict values ignored; `extends` relative / absolute /
  bare-package / missing-parent / broken-parent; broken `package.json`; unreadable source
  dir; `.d.ts` exclusion; installed-vs-declared TS version; the two validity-error paths.
  Plus 3 synthetic `ProjectInfo`s for `computeCapabilities`-only parity (incl. the
  `typecheck:ok` token path).
- **Assertion:** for every fixture, modern (stub-FS Layer) === oracle — same `Left`/`Right`
  disposition; on failure the same error `_tag` + verbatim message; on success the
  `ProjectInfo` field-for-field (`toStrictEqual`) AND the same `computeCapabilities` token
  set. A guard pins the oracle's `node:path` math reproduces the modern probed paths (so a
  pass can't be vacuous on a wrong-but-matching key).
- **Result:** 0 divergences across the 16+3 covered fixture classes. The only intentional
  deviations (D1–D5) are idiom / type-level and non-observable; none changes an output value,
  an error tag, or a message. **Coverage limits (review H1/H2):** the fixtures stay under the
  caps, so cap-TRUNCATION is pinned separately (`enumerate.test.ts` `cap truncation` +
  `node.test.ts` real-readdir) not by this oracle; symlinks and non-POSIX paths are not
  differentially covered (POSIX deployment contract, D3).

---

## 7. Architecture review (consolidated, `architecture-critic`)

Reviewed alongside the `contracts` slice. The critic verified the error-channel mapping, both
ignore-dir sets + both caps, the lenient/`extends` tsconfig parsing, the pure
`computeCapabilities` incl. the OFF-flag-emits-no-token RULE-020 trap, and that the prod
`NodeContext` Layer is exercised against a real temp dir (config's HIGH lesson — this slice
did it from the start).

**Applied:**
- **Cap-truncation now pinned (HIGH H1).** The differential fixtures all stayed under the
  caps, so the one order-sensitive, score-gating behavior (RULE-012 truncation) was untested.
  Added `enumerate.test.ts` `cap truncation` (small injected cap over a >cap tree, both
  walkers) + a `node.test.ts` test exercising it against REAL `NodeFileSystem` readdir order.
- **"0 divergences" claim qualified (HIGH H2).** §2 and §6 now enumerate the coverage limits
  (truncation pinned elsewhere; symlinks + non-POSIX not differentially covered).

**Recorded, no change (follow-ups in §4):**
- **M3 — `enumerate.ts` hand-joins paths (FileSystem-only channel) instead of the `Path`
  service (D3).** Defensible on POSIX; when wiring the engine, prefer the `Path` service to
  drop the cross-platform caveat.
- **M4 — swallowed non-ENOENT `stat`/`readdir` errors** silently undercount `sourceFileCount`
  (which gates `NoTypeScriptProjectError`). Faithful to legacy; the engine slice should add
  debug logging of skipped entries (observability gap).
- **M5 — `detectModuleSystem` carries a legacy dead branch** (`node16`/`nodenext` terms are
  inert). Preserved verbatim — do NOT "simplify" it into a behavior change.
- **L7 — `collectSourceFiles` is exported with no in-slice consumer** (ready for the diagnose
  slice); borderline speculative surface until that lands.
- **C1 — `Capability` de-vendor: DONE.** The local bare alias was deleted; this slice now
  imports the canonical `Capability` (type-only) from `@ts-doctor/contracts-effect`. One
  definition gates which rules fire → the score. (Suite green 109/109; `tsc --noEmit` clean.)

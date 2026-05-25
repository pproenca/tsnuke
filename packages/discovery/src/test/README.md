# Characterization tests — `discovery` module (Effect-TS target)

These tests **define "done"** for the Effect-TS rewrite of `ts-fix`'s **discovery**
module — the biggest core module (`legacy/ts-fix/packages/core/src/discover-ts-project.ts`,
442 lines), read-only as the oracle. This is an **EFFECTFUL** slice (real I/O), so the
suite reuses the **stub-FileSystem-Layer** pattern the `config` slice established
(`modernized/config/effect/src/test/loadConfig.test.ts`), extended for the discovery
walkers' `readDirectory` + `stat` calls.

The implementation lives at `src/main/` (imported as `../main/*.js` — `.js` on relative
specifiers, per the legacy convention; the `Bundler` moduleResolution in `tsconfig.json`
resolves `.js` to `.ts`).

## Scope

| Concern | File | Effect shape |
|---------|------|--------------|
| **RULE-012** file caps / `.d.ts` exclusion / two ignore-sets / DFS / unreadable-skip | `enumerate.test.ts` | `Effect<…, never, FileSystem>` |
| **RULE-022** discovery validity (typed errors on the error channel) + **RULE-021** facts | `discover.test.ts` | `Effect<ProjectInfo, TsconfigNotFoundError \| NoTypeScriptProjectError, FileSystem \| Path>` |
| **RULE-021** capability earning (PURE) | `capabilities.test.ts` | plain sync `(ProjectInfo) => Set<Capability>` |
| **Equivalence proof** vs frozen legacy oracle | `equivalence.test.ts` | both, over crafted fixtures |
| **Production-Layer smoke** (real OS temp dir) | `node.test.ts` | `NodeContext` + `*Node` runnables |

## No real disk (except the prod-Layer smoke)

Every test runs the discovery Effects against an **in-memory `FileSystem` Layer**
(`stubFs.ts`) backed by a flat `Map<absolutePath, FileNode>` (file / dir / unreadable).
`Path` is the REAL platform-agnostic `Path.layer` (a pure string op — proving the
discovery path math matches `node:path` semantics, the legacy contract). The **only**
disk-touching tests are the 4 in `node.test.ts`, which use an OS **temp** dir (never the
repo) and clean up in `finally` — proving the prod `NodeContext` wiring actually reads
disk (the lesson from the config slice's review).

## The typed errors are the Effect ERROR CHANNEL

Legacy `discoverTsProject` `throw`s `TsconfigNotFoundError` / `NoTypeScriptProjectError`.
The Effect port moves these to the **error channel** (`Effect<ProjectInfo, E, R>`), the
idiomatic replacement for `throw`. Tests assert via `Effect.either`: a failure → `Left<E>`
(same `_tag` + verbatim message), a success → `Right<ProjectInfo>`. Non-fatal cases (a
broken/unreadable `package.json`) stay **successes with defaults**.

## How the equivalence proof works (`equivalence.test.ts`)

1. A **vendored, frozen copy** of the legacy discovery functions
   (`discover-ts-project.ts:42-442`, incl. `computeCapabilities`) is the oracle,
   parameterized over a fake `{ existsSync, readFileSync, readdirSync, statSync }` backed
   by the SAME in-memory tree. Do NOT "improve" it — it reproduces legacy.
2. Crafted fixtures span every branch class: monorepo / app / lib / unknown; all-15
   strict flags ON; non-`true` strict values ignored; `extends` relative / absolute /
   bare-package / missing-parent / broken-parent; broken `package.json`; unreadable dir;
   `.d.ts` exclusion; installed-vs-declared TS version.
3. For each fixture, assert modern (stub-FS Layer) `=== ` oracle: same `Left`/`Right`
   disposition; on failure the same error tag + message; on success the ProjectInfo
   field-for-field (`toStrictEqual`) AND the same `computeCapabilities` token set.
4. A guard pins that the oracle's `node:path` math reproduces the paths the modern code
   probes via the real `Path.layer` (so a parity pass can't be vacuous on a wrong key).
5. `computeCapabilities` is ALSO proven equivalent over synthetic `ProjectInfo`s
   (decoupled from discovery), including the `typecheck:ok` token path (engine-reconciled).

## Running

```sh
cd modernized/discovery/effect
./node_modules/.bin/vitest run                              # all tests once (104)
./node_modules/.bin/vitest                                  # watch mode
./node_modules/.bin/vitest run src/test/equivalence.test.ts # just the proof
./node_modules/.bin/tsc --noEmit                            # typecheck (strict + exactOptionalPropertyTypes)
```

(The `pnpm test` / `pnpm typecheck` scripts also work; pnpm's pre-script deps check logs
a harmless `ERR_PNPM_IGNORED_BUILDS` for `@parcel/watcher`/`msgpackr-extract` — optional
native transitive deps of `@effect/platform-node` that `NodeFileSystem`/`NodePath` never
use. See `TRANSFORMATION_NOTES.md` §5.)

## Public surface these tests expect

```ts
import {
  discoverTsProject,    // (dir) => Effect<ProjectInfo, TsconfigNotFoundError | NoTypeScriptProjectError, FileSystem | Path>
  countSourceFiles,     // (root, cap?) => Effect<number, never, FileSystem>
  collectSourceFiles,   // (root, cap?) => Effect<ReadonlyArray<string>, never, FileSystem>
  computeCapabilities,  // (ProjectInfo) => Set<Capability>   — PURE, sync
  ProjectInfo,          // effect/Schema.Struct
  NodeContext,          // Layer<FileSystem | Path> (prod)
  discoverTsProjectNode, countSourceFilesNode, collectSourceFilesNode, // runnables
} from "../main/index.js";
```

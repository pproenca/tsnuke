# Characterization tests — `fix-applier` (`--fix` convergence + source mutation, Effect-TS target)

These tests **define "done"** for the Effect-TS rewrite of `tsnuke`'s `--fix`
applier (RULE-005, P0). The legacy module is the oracle
(`legacy/tsnuke/packages/tsnuke/src/fix-applier.ts`, read-only). No legacy
`fix-applier.test.ts` exists, so the vectors are DERIVED from the documented rule
behaviour (BUSINESS_RULES.md RULE-005 / RULE-032) and pinned against a **frozen vendored
copy** of legacy `applyFixes` / `groupFixesByFile`.

## Two layers

| File | Scope | Notes |
|------|-------|-------|
| `applyFixes.test.ts` | the **PURE** core (`applyFixes`, `groupFixesByFile`) | characterization + a differential equivalence proof vs a frozen legacy oracle (deep-equal `output`/`appliedCount`/`skippedCount` + grouping). The port is verbatim, so this is byte-for-byte equivalence. |
| `rule005-sme.test.ts` | the **RULE-005 SME concern** (preserved, not fixed) | 3+-adjacent / 3-overlap chains pinning the *current* ≤2-pass outcome. See `TRANSFORMATION_NOTES.md` §4. |
| `applyFixesToFiles.test.ts` | the **EFFECTFUL** shell (the CWE-59 / atomic cure) | stub-`FileSystem`-Layer tests (atomic temp→rename, unchanged-not-written, symlink rejected, out-of-root rejected, read-error skip) + real-temp-dir prod-`NodeContext` tests (incl. the CWE-59 symlink regression test). |

## Rules under test

| Rule | What | Where |
|------|------|-------|
| RULE-005 | auto-fix convergence ≤2 passes; descending-by-start right-to-left splice; conflict vs degenerate vs touching-endpoint; cumulative-delta carry; file written only when output differs | `applyFixes.test.ts`, `rule005-sme.test.ts`, `applyFixesToFiles.test.ts` |
| RULE-032 | only `kind === "auto-fix"` edits are collected/applied; `codemod`/`manual` advisory | `applyFixes.test.ts` |

## Deliberate deviation (asserted, not bit-matched): the CWE-59 / atomic cure

The effectful `applyFixesToFiles` is the slice's one intentional divergence from the
legacy oracle (like `score`'s `.5`-rounding deviation). Legacy `io.write` followed
symlinks and wrote non-atomically; the new shell **rejects symlinks (no-follow via
`readLink`) + out-of-root paths** and **writes atomically (temp + `rename`)**. These
tests assert the NEW (safer) behaviour: the symlink test proves the target is left
untouched (CWE-59 regression), and the op-log assertions prove temp→rename order. See
`TRANSFORMATION_NOTES.md` §3 (D2).

## The RULE-005 SME concern — preserved, NOT fixed

`rule005-sme.test.ts` pins the *current* ≤2-pass behaviour. While porting, an exhaustive
trace surfaced that the pass-2 / `carried` path is **unreachable dead code** (every
skipped edit is classified a true conflict), so the real shape is "one winner per overlap
cluster, the rest silently counted in `skippedCount`". The Brief's Q-fix
(loop-to-convergence) belongs in the CLI/Fix phase; this slice keeps the oracle behaviour
so the equivalence proof stays clean. Full reasoning in `TRANSFORMATION_NOTES.md` §4.

## Running

```sh
cd modernized/fix-applier/effect
./node_modules/.bin/vitest run          # all tests once
./node_modules/.bin/vitest              # watch mode
./node_modules/.bin/tsc --noEmit        # typecheck (strict + exactOptionalPropertyTypes)
```

## Public surface these tests expect

```ts
import {
  applyFixes,                 // (source, fixes) => ApplyResult                          — PURE
  groupFixesByFile,           // (diagnostics) => FileFixGroup[]                          — PURE
  isInsideRoot,               // (root, candidate) => boolean                            — PURE
  applyFixesToFiles,          // (diagnostics, rootDir) => Effect<ApplyFilesResult, never, FileSystem | Path>
  applyFixesToFilesDetailed,  // …same, + rejected[] detail
  applyFixesToFilesNode,      // (diagnostics, rootDir) => Promise<ApplyFilesResult>     — prod NodeContext
  NodeContext,                // Layer<FileSystem | Path>
} from "../main/index.js";
```

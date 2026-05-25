# Transformation Notes — `fix-applier` (the `--fix` convergence + source-mutation path) → Effect-TS

Strangler-fig slice produced by `/code-modernization:modernize-transform ts-doctor fix-applier effect`.
Source (READ-ONLY): `legacy/ts-doctor/packages/ts-doctor/src/fix-applier.ts:36-244` — the
PURE splicer (`collectEdits`/`intersects`/`applyEditsOnePass`/`applyFixes`,
`:36-170`) + the pure grouping (`groupFixesByFile`, `:187-203`) + the effectful file
shell (`FileIo` seam + `applyFixesToFiles`, `:205-244`). Target:
`modernized/fix-applier/effect/` (package `@ts-doctor/fix-applier-effect`).

Implements **RULE-005** (auto-fix convergence, ≤2 passes — **P0**) over the
**RULE-032** fix-kind taxonomy (only `auto-fix` is mechanically applied), split into:
- the **PURE core** (`applyFixes.ts`, `applyFixes` + `groupFixesByFile`) — ported
  **VERBATIM**, plain synchronous string math + grouping, **NO Effect monad**; and
- the **EFFECTFUL shell** (`applyFixesToFiles.ts`, NEW) — an `Effect<...>` over
  `@effect/platform` `FileSystem` + `Path`, satisfied by a Layer at the edge
  (`NodeFileSystem`/`NodePath` in prod; an in-memory stub in tests). This shell is the
  **CWE-59 / non-atomic-write cure** (see §3) — a deliberate SECURITY improvement over
  legacy's direct `io.write`.

`Diagnostic`/`Fix`/`TextEdit` are imported from `@ts-doctor/contracts-effect` (`file:`
dep) — **NOT re-vendored** — exactly as `build-report/effect` consumes them. The
effectful shell mirrors `config/effect`'s `loadConfig.ts` Effect-over-FileSystem shape
(stub-layer test pattern, `NodeContext`, `*Node` runnable).

Verified by **59** tests across 3 files:
- **39** for the pure core (`applyFixes.test.ts`): characterization (non-overlapping
  applied, conflict dropped+counted, degenerate dropped, touching endpoints NOT a
  conflict, equal-start ties, only `auto-fix` collected, empty → no-op, grouping order)
  **+ a differential equivalence proof** against a frozen vendored copy of legacy
  `applyFixes`/`groupFixesByFile` over 13 + 4 crafted fixtures (deep-equal on
  `output`/`appliedCount`/`skippedCount` and grouping).
- **6** for the RULE-005 SME concern (`rule005-sme.test.ts`) — the 3+-adjacent /
  3-overlap chains, pinning the *current* (≤2-pass) outcome (see §4).
- **14** for the effectful shell (`applyFixesToFiles.test.ts`): stub-FileSystem tests
  (atomic temp→rename order asserted, unchanged file NOT written, SYMLINK rejected,
  out-of-root rejected, read-error skip, multi-file aggregate) **+ 3 production-Layer
  tests** on a real OS temp dir via `NodeContext` (apply a fix; a real symlink left
  untouched — the CWE-59 regression test; a missing file skipped).

**Result:** 59/59 tests pass · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`.

---

## 1. Mapping table (legacy → target, per export)

| Legacy export (`fix-applier.ts`) | Target | Transform |
|---|---|---|
| `ApplyResult` (`:26-33`) | `applyFixes.ts` `ApplyResult` | verbatim interface |
| `collectEdits` (`:36-44`) | `applyFixes.ts` `collectEdits` (internal) | verbatim (RULE-032 `auto-fix`-only) |
| `intersects` (`:72-74`) | `applyFixes.ts` `intersects` (internal) | verbatim (strict `<`, touching ≠ intersect) |
| `applyEditsOnePass` (`:89-137`) | `applyFixes.ts` `applyEditsOnePass` (internal) | **verbatim** (the load-bearing splicer) |
| **`applyFixes(source, fixes)`** (`:149-170`) | `applyFixes.ts` `applyFixes` | **verbatim PURE** — ≤2-pass cap preserved (§4) |
| `DiagnosticWithFix` (`:173`) | `applyFixes.ts` `DiagnosticWithFix` | verbatim type |
| `FileFixGroup` (`:176-179`) | `applyFixes.ts` `FileFixGroup` | verbatim interface |
| **`groupFixesByFile(diagnostics)`** (`:187-203`) | `applyFixes.ts` `groupFixesByFile` | **verbatim PURE** |
| `FileIo` (read/write seam) (`:206-209`) | *(removed)* | replaced by the `FileSystem` service requirement (§2/§3) |
| `ApplyFilesResult` (`:212-216`) | `applyFixesToFiles.ts` `ApplyFilesResult` | verbatim interface |
| **`applyFixesToFiles(diagnostics, io)`** (`:223-244`) | `applyFixesToFiles.ts` `applyFixesToFiles` | **→ `Effect<ApplyFilesResult, never, FileSystem \| Path>`** + the CWE-59/atomic cure (D2) |
| `io.read` / `io.write` (`node:fs`, ambient) | `FileSystem.readFileString` / temp `writeFileString` + `rename` | service, not `node:fs`; atomic + symlink/out-of-root gate (D2) |
| *(none — new)* | `applyFixesToFiles.ts` `applyFixesToFilesDetailed` | adds a `rejected[]` detail channel (D3) |
| *(none — new)* | `applyFixesToFiles.ts` `NodeContext` + `applyFixesToFilesNode` / `…DetailedNode` | prod runnable over `NodeContext` (mirrors config slice) |
| *(none — new)* | `pathContainment.ts` `isInsideRoot` | pure path-containment (mirrors `security/effect` `isInsideTempDir`) |

---

## 2. The pure core stays pure (NOT Effect-wrapped)

`applyFixes` and `groupFixesByFile` are plain synchronous functions, ported byte-for-byte
(brief constraint: "Pure core stays pure; only the file IO is effectful"). They are the
deterministic kernel the effectful shell calls. The equivalence section of
`applyFixes.test.ts` embeds a **frozen vendored copy** of legacy `fix-applier.ts:36-203`
and asserts `toStrictEqual` over crafted edit/diagnostic sets — because the port is
verbatim, this is byte-for-byte behavioral equivalence (the whole point of porting the
load-bearing P0 algorithm unchanged rather than reimagining it).

`pathContainment.ts` `isInsideRoot` is also pure (`node:path` calls are string ops, no FS
access) — same posture as the `security/effect` slice's `isInsideTempDir`.

---

## 3. Deviations

### D1 — `applyFixes` / `groupFixesByFile`: pure-VERBATIM (no deviation)
Ported unchanged, including the subtle legacy behaviors preserved on purpose:
- `groupFixesByFile` buckets on `d.fix !== undefined` only (NOT on `fix.kind`), so a
  `codemod`/`manual` fix still creates/extends a file bucket; its non-`auto-fix` edits
  are dropped later inside `applyFixes`'s `collectEdits`. Verbatim.
- degenerate edits (`start < 0 || end < start || end > source.length`) are dropped
  silently (NOT counted in `skippedCount`); touching endpoints are not a conflict;
  equal-start ties sort descending by `end`. All verbatim.

### D2 — `applyFixesToFiles`: Effect-over-FileSystem **with the CWE-59 / atomic-write cure** (deliberate SECURITY improvement)
This is the slice's one behavioural divergence from the legacy oracle, and it is
**intentional** — the Modernization Brief names this the *top security finding* (Brief
lines 18 / 72 / 82). It is the fix-applier analogue of the `score` slice's documented
`.5`-rounding deviation: a knowing departure from bit-match, with the new behaviour
asserted by tests rather than the old.

Legacy called `io.write(path, output)` directly — an in-place write that **(a) follows
symlinks** (CWE-59: a symlink inside the project tree pointing at an out-of-repo file
would be clobbered) and **(b) is non-atomic** (a crash mid-write leaves a truncated
source file — and `--fix` mutates USER source). The new shell cures BOTH, BEFORE every
write:

1. **Canonical containment (SEC-001 hardening)** — resolve the target's PARENT dir with
   `FileSystem.realPath` (following any symlinked *prefix* to its real location), then
   `isInsideRoot(realRoot, canonicalTarget)` against the realPath-resolved root. A pure
   STRING containment check (the first cut) is bypassable by a **directory symlink inside
   the root** that redirects the write outside it — the security audit PoC'd exactly this.
   Resolving the prefix closes it. On a real FS `realPath` resolves; the in-memory stub
   (no symlinks) falls back to the string path (the attack needs an EXISTING symlink,
   which `realPath` always resolves, so the fallback never reopens the hole).
2. **Symlink reject (no-follow)** — probe the canonical target with `FileSystem.readLink`.
   `readLink` reads the link's OWN target (it does NOT follow the link) and FAILS on a
   regular file; **success ⇒ symlink ⇒ skip it** (never followed, never clobbered).
   **API note:** this `@effect/platform` (`0.96.1`) exposes **no `lstat`** — the Brief's
   "`lstat` + no-follow" is realised with `readLink`-succeeds, the equivalent no-follow
   test on the available surface. (Swap for `lstat(...).type === "SymbolicLink"` if added.)
3. **Atomic write** — write to an **unpredictable** same-dir temp
   (`.<base>.<seq>.tsdoctor-fix.tmp`) opened **O_EXCL (`flag: "wx"`, SEC-002 hardening)** —
   which refuses to FOLLOW or overwrite a symlink pre-planted at the temp path (the audit
   PoC'd a predictable-temp-symlink write-through that the default `"w"` flag allowed) —
   then `FileSystem.rename` it over the canonical target (atomic same-FS replace, not an
   in-place truncate; same-dir so the rename stays same-FS). On any write/rename failure
   the temp is best-effort removed and the original target is left intact (no partial write).

**Totality (error channel `never`).** A read `PlatformError` (missing/unreadable file)
skips that file with `reason: "read-error"`; a write/rename failure skips with
`"write-error"`; symlink/out-of-root skip with their reasons. The aggregate
`ApplyFilesResult` is ALWAYS returned — legacy's `io.read` could throw out of the whole
run; the new shell never throws out (a strictly safer all-or-each loop). `appliedCount`/
`skippedCount` are still tallied from the pure splice even when the security gate refuses
the write, so the counts reflect what the RULE-005 algorithm decided (matching legacy,
where the counts are computed pre-write).

### D3 — added `applyFixesToFilesDetailed` (+ `rejected[]`)
Legacy `ApplyFilesResult` is `{ filesChanged, appliedCount, skippedCount }`. The public
`applyFixesToFiles` returns **exactly** that shape (the legacy contract). A NEW
`applyFixesToFilesDetailed` additionally returns `rejected: { filePath, reason }[]` so
the CWE-59 cure is observable/testable (and so the CLI can warn the user which files were
skipped and why). `applyFixesToFiles` is `applyFixesToFilesDetailed` with the detail
projected away — additive, no change to the legacy aggregate.

### D4 — `FileIo` seam → `FileSystem` service
Legacy's injectable `{ read, write }` seam is replaced by depending on the
`@effect/platform` `FileSystem` (+ `Path`) service in the Effect's REQUIREMENTS channel,
satisfied by a Layer at the edge. Tests inject an in-memory stub `FileSystem` Layer
(backed by a `Map` + a symlink `Set` + an op log); prod injects `NodeContext`. Same
testability the `FileIo` seam gave, on the one official IO substrate.

---

## 4. RULE-005 SME question — PRESERVED + FLAGGED (data-integrity)

BUSINESS_RULES.md SME question #1: *"Can a chain of 3 or more mutually-adjacent,
non-conflicting edits ever require a 3rd pass?"* If yes, the hard ≤2-pass cap silently
drops valid edits into `skippedCount` — a data-integrity issue because `--fix` mutates
user source.

**This slice DELIBERATELY PRESERVES the legacy ≤2-pass behaviour EXACTLY** (per the
transform brief: "do NOT 'fix' the ≤2-pass completeness gap — preserve + document it").
It is pinned by `rule005-sme.test.ts`.

**Sharper finding (documented for the SME / the rewrite).** While porting, an exhaustive
trace surfaced that the **pass-2 / `carried` path is unreachable dead code** in the
legacy algorithm:

> Edits are sorted DESCENDING by `start`, so the winner applied first always has the
> larger-or-equal start. A loser is skipped only when `loser.end > winner.start`. But
> because `loser.start ≤ winner.start < winner.end`, that skip condition ALSO implies
> `loser.start < winner.end` AND `winner.start < loser.end` — which is exactly the
> `intersects` predicate. So **every skip is classified a TRUE CONFLICT**; `carried` is
> ALWAYS empty; `applyFixes` returns after pass 1 and **pass 2 never runs**.

Verified exhaustively over *all* 1-/2-/3-edit sets on a length-6 source (0 carries
observed) and 200k random trials (0 carries). So the real RULE-005 shape is **one winner
per overlap cluster, all other overlappers dropped as conflicts in a single pass**; the
"≤2 passes settle any set" convergence story is asserted but not actually exercised. The
3+-edit SME concern manifests concretely as *"extra overlappers are silently counted in
`skippedCount` and never retried"* — `rule005-sme.test.ts` pins exactly this (e.g. a
tight 3-overlap cluster → 1 applied, 2 silently skipped). Benign touching-endpoint
adjacency, by contrast, all applies in pass 1 (also pinned).

**Recommendation for the rewrite (NOT done here):** the Brief's Q-fix already resolved
this to *loop-to-convergence* (iterate passes to a fixpoint, safety cap ~10) as a
**deliberate behavioural improvement over the oracle** (Brief lines 131 / 183 / 214) —
eliminating the silent-drop class, with the P3 gate proving *no valid edit is dropped* +
apply→reparse→no-diagnostic-increase rather than bit-matching legacy `skippedCount`. That
belongs in the CLI/Fix phase, against the new behaviour; this slice keeps the oracle
behaviour so the equivalence proof is clean and the divergence is a single, named,
deliberate decision (D2 security cure) rather than two entangled ones.

---

## 5. Follow-ups

- **Wire `applyFixesToFilesNode` into the CLI `--fix` path.** The CLI slice's `--fix`
  command should call `applyFixesToFilesNode(diagnostics, projectRoot)` (or the
  `…DetailedNode` variant to report `rejected[]` to the user). Currently this slice is
  additive infra with no live caller (like the dormant security guards, RULE-027).
- **Only `no-floating-promises` currently emits a real fix (RULE-026).** Of the 6 rules
  that declare `fixKind: "auto-fix"`, five (`triple-equals`, `no-var`, `no-const-enum`,
  `no-inferrable-type-annotation`, `prefer-error-instantiation`) attach **no** `fix`
  payload, so `--fix` is a silent no-op for them today. Until those emit edits (or are
  downgraded to `codemod`/`manual`), this applier mostly processes `no-floating-promises`
  fixes. Fixing RULE-026 is the prerequisite for `--fix` delivering its core value prop.
- **`--fix` shifts positions and invalidates positional identities by design.** Applying
  edits rewrites offsets, so a diagnostic's `line`/`column`/`[start,end)` no longer point
  at the same code after a fix. The intended loop is `fix && rescan` (re-run analysis on
  the rewritten source), not "re-use the old positions" — relevant to the agent
  `fix && rescan` loop and to any caching of diagnostic identity across a `--fix`.
- **Resolve the RULE-005 SME question** (§4) before/at the CLI/Fix phase: adopt
  loop-to-convergence (Brief Q-fix) to remove the silent-drop class. Pin termination
  (fixpoint within the safety cap) and the no-valid-edit-dropped property at that point.
- **`lstat` upgrade:** if a future `@effect/platform` adds `FileSystem.lstat`, swap the
  `readLink`-succeeds symlink probe for `lstat(...).type === "SymbolicLink"` (same intent,
  one fewer error-mapping hop).

---

## 6. Security review (consolidated, `security-auditor`)

The auditor confirmed `applyFixes` is **byte-faithful** to legacy (no file-corruption risk;
the pass-2/`carried` path is genuinely unreachable dead code, preserved verbatim) and that
the atomic `rename` design + the file-symlink reject are sound. It found **two real holes in
the first cut of the CWE-59 cure** — both now CLOSED and regression-tested:

- **SEC-001 (HIGH) — directory-symlink prefix escape.** The original `isInsideRoot` was
  string-only, so a directory symlink INSIDE the root (`root/escape → /outside`) let a
  `--fix` write land outside the root (PoC'd). **Fixed:** the gate now `realPath`-resolves
  the target's parent dir and containment-checks the CANONICAL target against the
  realPath-resolved root. Regression test: a dir-symlink victim is rejected `out-of-root`
  and left untouched.
- **SEC-002 (MEDIUM) — the cure's own predictable temp file was a new symlink-write sink.**
  The temp was a fixed `.<base>.tsdoctor-fix.tmp` written with the default `"w"` flag (which
  follows symlinks), so a pre-planted symlink there could be clobbered. **Fixed:** the temp
  is now unpredictable (`.<base>.<seq>.tsdoctor-fix.tmp`) and opened **O_EXCL (`flag: "wx"`)**,
  which refuses to follow/overwrite. Regression test: a pre-planted temp-symlink → write
  fails → file skipped (`write-error`), the pointee untouched.

Both `FileSystem.realPath` and the `"wx"` open flag exist in `@effect/platform@0.96`. With
these the CWE-59 cure is sound: writes stay inside the realPath-resolved root, no symlink
(prefix, target, or temp) is followed, and the write is atomic. **61 tests** after the fixes.

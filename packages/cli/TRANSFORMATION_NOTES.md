# Transformation Notes — `cli` → `@effect/cli` (RE-IMAGINED)

Adapter slice produced by `/code-modernization:modernize-transform ts-doctor cli effect`.
Sources (READ-ONLY): `legacy/ts-doctor/packages/ts-doctor/src/`
- `flags.ts` (323) — `parseInspectFlags`, `validateModeFlags` (RULE-028), `parseFileLine`
- `commands/inspect.ts` (184) — `runInspect`, `buildJsonReport`, `findDiagnosticAt`, `InspectIo`
- `cli.ts` (87) — the process edge (SIGINT/SIGTERM → 130, EPIPE → 0, uncaught → 1)
- `commands/install.ts` (162) — `runInstall` (RULE-038 inert stubs)

Target: `modernized/cli/effect/` (`@ts-doctor/cli-effect`). This is the user-facing
entry — it wires the finished engine + output + fix + exit-code slices into the
`ts-doctor` command on **`@effect/cli`**.

**This is a RE-IMAGINING, not a verbatim port.** The hand-rolled argv `switch`
(`parseInspectFlags`, CCN 64) and the `validateModeFlags` gate are REPLACED by
`@effect/cli` `Options`/`Args` + constraints. The equivalence bar is **BEHAVIORAL**:
same flags accepted, same validation rejections (same message text), same output
content, same exit codes — **NOT** a byte-verbatim reproduction of the parser
internals. Auto-help and shell completions are NEW capabilities the library provides
for free.

**Result:** **55/55 tests pass** · `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. `@effect/cli@0.75.1` +
`@effect/printer`/`-ansi@0.49` resolved against `effect@^3.21` / `@effect/platform@^0.96`;
all 7 direct `file:` slice deps (+ their full transitive `.ts`-entry closure) install
and vitest-inline cleanly.

---

## 1. Mapping table (legacy → target)

| Legacy | Behavior | Target |
|--------|----------|--------|
| `flags.ts` `parseInspectFlags` (argv switch) | argv → flags record | **DELETED** — `@effect/cli` `Options`/`Args` (`inspectCommand.ts`) do POSIX parsing |
| `flags.ts` `InspectFlags` interface | the resolved flag shape | `flags.ts:42-78` (`InspectFlags`, field-identical) |
| `flags.ts` `FailOn` / `OutputFormat` | flag domains | `flags.ts:22,25` (types) · enforced by `Options.choice` |
| `flags.ts` `validateModeFlags` (RULE-028) | mutually-exclusive set | `flags.ts:121-147` (pure predicate) **run as an `Options.mapEffect` constraint** (`inspectCommand.ts` `resolveInspectFlags`) |
| `flags.ts` `parseFileLine` | `<file:line>` parse | `flags.ts:92-108` (ported VERBATIM) |
| `flags.ts` `FlagError` | bad-combo error | `flags.ts:84` → translated to `ValidationError.invalidValue` |
| `inspect.ts` `runInspect` flow | orchestration | `inspectHandler.ts:135-200` (`runInspect`, as an Effect over the IO seam) |
| `inspect.ts` `toDiagnoseOptions` | flags → engine opts | `inspectHandler.ts:66-77` (VERBATIM; `deep:undefined` ⇒ auto, RULE-035) |
| `inspect.ts` `buildJsonReport` + `JSON.stringify` | JSON output | `inspectHandler.ts:110-130` (`buildJsonString`) → **delegates to `buildReport` (build-report slice)** |
| `inspect.ts` `findDiagnosticAt` | explain lookup | `inspectHandler.ts:87-93` (VERBATIM) |
| `inspect.ts` pretty / agent / score / explain output | output selection | `inspectHandler.ts:164-193` → `renderPretty`/`formatAgentReport`/`renderScoreLine`/`explain` (**format slice**) |
| `inspect.ts` exit-code gate | RULE-030 | `inspectHandler.ts:196` → `resolveExitCode` (**exit-code slice**) |
| `inspect.ts` `InspectIo` seam | testable IO | `inspectHandler.ts:38-62` (`InspectIo`: stdout/stderr + injectable `diagnose`/`applyFixes` + `ruleCatalog`) |
| `cli.ts` SIGINT/SIGTERM → 130 | process edge | `bin.ts:28-34` (explicit handlers; pins exact codes) |
| `cli.ts` stdout EPIPE → 0 | process edge | `bin.ts:36-38` |
| `cli.ts` uncaught → 1 + `ts-doctor: <msg>` | process edge | `bin.ts:48-72` (`Effect.catchAllCause`, terse message, `disableErrorReporting`) |
| `cli.ts` install-vs-inspect dispatch | command routing | `cli.ts:21` (`Command.withSubcommands` — POSIX dispatcher) |
| `cli.ts` `process.argv.slice(2)` | argv prep | **GONE** — `@effect/cli` strips the node/script prefix |
| `install.ts` `runInstall` | RULE-038 install | `installHandler.ts:128-147` (over `@effect/platform` FileSystem) |
| `install.ts` `buildSkillMarkdown` / `planInstall` | pure plan | `installHandler.ts:48-117` (ported VERBATIM, incl. the inert stub body) |
| `install.ts` flag parse | install flags | `installCommand.ts` (`Options`) |

---

## 2. How RULE-028 became `Options` constraints

Legacy validated AFTER parsing: `parseInspectFlags(argv)` → `validateModeFlags(flags)`,
throwing `FlagError` on the first bad combo. On `@effect/cli` the rejection happens
**inside the parser**:

1. Every flag is declared as an `Options` (`Options.boolean`/`choice`/`text`), combined
   with `Options.all({…})` into one record.
2. That record is fed through **`Options.mapEffect`** (`resolveInspectFlags`), which:
   - resolves the raw record → `InspectFlags` (tri-state `deep`, `--json-compact`
     implies `--json`, `--format json` implies `--json`, `--project` comma-split,
     `--diff`/`--diff-base` → the mode label),
   - validates `<file:line>` via `parseFileLine` (a `FlagError` → `ValidationError`),
   - runs the pure `validateModeFlags`; on a violation it **fails the option-decode**
     with `ValidationError.invalidValue(HelpDoc.p(<legacy message>))`.
3. A failed decode means the handler never runs and `@effect/cli` reports the error +
   exits non-zero — i.e. the contradictory combo is **rejected by the parser**, with
   the **same message text** as legacy.

`--format`/`--fail-on` domain validation is enforced one level up by `Options.choice`
(an out-of-set value can't even reach `resolveInspectFlags`). The full legacy
rejection set is reproduced and asserted in `src/test/rule028.test.ts` (both the pure
predicate AND the `ValidationError` path).

---

## 3. Deliberate deviations (RE-IMAGINED on `@effect/cli`)

1. **Parser internals are not reproduced.** `parseInspectFlags` (the bespoke argv
   `switch`) is gone; `@effect/cli` owns parsing. Equivalence is the flag-acceptance /
   validation / output / exit-code CONTRACT, not the control flow.
2. **`--diff [base]` split into `--diff` (boolean) + `--diff-base <ref>` (optional).**
   Legacy's `--diff` optionally consumed the next token as the base — non-POSIX (a flag
   that may swallow a positional). `@effect/cli` is POSIX, so the base moves to a named
   `--diff-base`. Same resolved shape (`diff: { base }`). RULE-033 is labels-only anyway
   (see §4), so this affects only how the base is spelled on the command line.
3. **Auto-help + shell completions are NEW.** `--help`, per-command usage, and
   `getBashCompletions`/`getZshCompletions`/`getFishCompletions` come free with
   `@effect/cli` — the hand-rolled parser had none. (`--help` renders to the library's
   own console sink, not the injected `Terminal`; the e2e smoke asserts it succeeds.)
4. **One Terminal sink for stdout+stderr in the handler seam.** `@effect/cli`'s
   `Terminal` has a single `display`; the `--fix` summary (legacy stderr) routes there in
   the production seam. The PROCESS EDGE (`bin.ts`) keeps real stdout/stderr separation
   for piping; tests capture text regardless of channel. (The `InspectIo` seam keeps
   `stdout`/`stderr` as distinct members so a future split is a one-line change.)
5. **Terse error message preserved via `catchAllCause` + `disableErrorReporting`.**
   Effect's default is a pretty cause dump; `bin.ts` suppresses it and emits the legacy
   `ts-doctor: <message>` instead, so the uncaught-error contract is byte-identical.
6. **`buildJsonReport` → the build-report slice.** Legacy hand-built the report object;
   the CLI now assembles a single-project `BuildReportInput` and calls `buildReport`
   (RULE-004/034 owned by that slice). v1 is SINGLE-PROJECT (one `diagnose` wrapped in a
   1-project report) — no monorepo loop, matching legacy.
7. **Pure logic is consumed, never re-implemented.** All formatting (`renderPretty`/
   `renderScoreLine`/`formatAgentReport`/`explain`), the exit gate (`resolveExitCode`),
   the report (`buildReport`), and fix application (`applyFixesToFilesNode`) come from
   the proven slices.

---

## 4. What was NOT migrated / preserved defects

- **RULE-033 diff/staged file-selection is STILL a STUB (labels only).** `--diff`/
  `--staged` set the `mode` label in the JSON report but no changed-files selection is
  wired — `diagnose` performs a full-tree scan regardless (confirmed legacy defect,
  assessment Debt #7). Carried forward unchanged; the CLI threads the labels through and
  the `--json` mode-label tests pin the label behavior. `diff` metadata is always `null`.
- **RULE-038 `install` writes INERT hooks — PRESERVED + FLAGGED, not fixed.** The
  written `.git/hooks/pre-push` body is `#!/bin/sh\n# TODO…\nexit 0\n` (does nothing →
  false CI/local protection), and it **clobbers any existing `pre-push` unconditionally**
  (assessment Security Low). Both behaviors are reproduced VERBATIM and asserted as-is in
  `install.test.ts` (incl. an explicit "clobbers an existing hook" test). The brief
  forbids silently fixing this; it is a follow-up below.
- **`--fix` is mostly a no-op until RULE-026.** The fix-applier slice mechanically
  applies only `auto-fix` edits (RULE-032), and 5 of the 6 auto-fix rules currently emit
  no edits (RULE-026, confirmed). The wiring is correct and proven (`fix.test.ts` mutates
  a real file via a synthetic `auto-fix`), but in practice `--fix` will rarely change a
  file until RULE-026 is addressed in the rule slices.
- **`--annotations` / `--pr-comment` are flags-only.** They are accepted and validated
  (RULE-028 exclusivity) but, as in legacy, do not yet emit a distinct annotations /
  PR-comment payload — the output still routes to pretty/json/agent. Carried forward.
- **The exit-code slice's dead `hadError` branch** is unused here (the process edge maps
  uncaught failures to 1 directly), matching legacy where `runInspect` never passed
  `hadError`. The brief's Q-failOn (config feeds the gate, flag overrides) is a config
  wiring follow-up not in this slice's scope (the CLI reads only the `--fail-on` flag,
  as legacy did).

---

## 5. Follow-ups

- **F1 — RULE-038 real hook install.** Replace the inert `pre-push` stub with a real,
  non-blocking `npx ts-doctor --diff --fail-on error` hook that RESPECTS an existing hook
  chain instead of clobbering it. (Confirmed defect; preserved here by mandate.)
- **F2 — RULE-033 diff/staged file selection.** Wire git diff/staged → `includePaths`
  (the engine already accepts `includePaths`) so `--diff`/`--staged` actually narrow the
  scan, and populate the report `diff` metadata.
- **F3 — Q-failOn config precedence.** Make `config.failOn` feed the gate with the CLI
  `--fail-on` flag overriding it (flag > config > default `"error"`), retiring the dead
  `hadError` resolver branch (brief Q-failOn).
- **F4 — `--annotations` / `--pr-comment` payloads.** Emit the CI annotations / PR-comment
  bodies these flags imply.
- **F5 — stdout/stderr split + streaming progress.** Route the `--fix` summary to real
  stderr through a two-sink Terminal, and add the brief's `Stream<Diagnostic>` live
  progress (a new UX capability).
- **F6 — Build/bin packaging.** The `bin` (`bin.ts`) uses `.js`-extension ESM imports
  (the repo convention); it runs under vitest's esbuild transform today and needs a build
  step (or a loader) to execute as a raw `node` bin.

---

## 6. Test inventory (55 tests, 5 files)

- `rule028.test.ts` (23) — RULE-028: the pure `validateModeFlags` rejection set + valid
  combos (verbatim messages); `resolveInspectFlags` failing the parser-decode with a
  `ValidationError`; `parseFileLine` malformed cases; tri-state / `--json-compact` /
  `--project` / `--diff` resolution.
- `inspectHandler.test.ts` (17) — output formats (pretty / `--no-score` / score / json /
  json-compact / agent / explain / mode labels) over the capturing IO seam; exit codes
  (RULE-030: clean→0, error+error→1, warning+error→0, any+warning→1, none→0, score→0);
  `--fix` wiring (called with diagnostics + project root, summary printed; not called
  without `--fix`).
- `install.test.ts` (7) — RULE-038: pure `planInstall` (SKILL.md + inert pre-push +
  agent-hook); real-temp-dir writes; `--agent-hooks`; `--dry-run` writes nothing; exit 0;
  the CONFIRMED clobber defect.
- `fix.test.ts` (2) — `--fix` end-to-end against real files via `applyFixesToFilesNode`
  (an `auto-fix` mutates the file; a `manual` fix mutates nothing).
- `e2e.test.ts` (6) — full `run(argv)` through the command tree against a real temp TS
  project with a capturing Terminal: clean + `--score` → score line + exit 0; violation
  project (`no-explicit-any`) via `--format agent` + `--json`; `install` subcommand
  dispatch; `--help` succeeds (auto-help); unknown flag rejected (POSIX parser).

---

## 7. Architecture review (consolidated, `architecture-critic`)

Reviewed alongside the MCP slice. The critic confirmed the CLI reproduces the legacy
flag/exit/output contract: **RULE-028** exclusivity set + verbatim messages (as `@effect/cli`
`Options` constraints), **RULE-030** exit codes via the proven `exit-code` slice + the process
edge (SIGINT/SIGTERM→130, EPIPE→0, uncaught→1+stderr), output-format selection delegating to the
proven `format`/`build-report` slices (no re-implementation), `--fix` → `applyFixesToFilesNode`
(real on-disk mutation tested), and the **RULE-038** inert+clobbering `pre-push` stub preserved
verbatim + flagged (not silently fixed). No formatting/scoring/exit logic is re-implemented.

**Applied:**
- **H1 (HIGH) — `VERSION` divergence fixed.** The constant had drifted `"0.0.0"`→`"0.1.0"`,
  leaking into the user-visible `--json` `version` field (legacy emits `"0.0.0"`; the MCP slice
  kept `"0.0.0"` — the two surfaces disagreed), and the handler test was written to the new value.
  Reverted to `"0.0.0"` (byte-equivalent + consistent with MCP); the test values were aligned.

**Recorded (deviations / preserved-defects, no code change):**
- **M1** — `Args.directory` (`@effect/cli` path-arg) rejects an EXISTING file passed as the
  positional, where legacy accepted any string and let the engine handle it. Defensible (better UX),
  but a parser-level acceptance change — documented here as a deliberate deviation.
- **M2** — the `--why`/`--explain` exclusivity asymmetry (legacy `validateModeFlags` checks
  `explain` but not its `--why` alias, so `--why --json` slips through) is a PRESERVED legacy
  defect — flagged here, not fixed.
- **L1** `--diff-base` without `--diff` is silently inert; **L2** the in-handler Terminal seam
  merges the `--fix` summary (legacy stderr) with stdout (the process edge keeps real separation).

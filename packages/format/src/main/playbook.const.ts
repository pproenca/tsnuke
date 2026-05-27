/**
 * The canonical tsnuke agent playbook, inlined as a TypeScript string constant.
 *
 * SOURCE OF TRUTH: `prompts/agent.md` at the repo root. This constant MIRRORS that
 * file so the CLI bundle (`packages/cli/dist/cli.js`) ships the playbook
 * self-contained — without requiring the consumer to also have the markdown file
 * on disk or fetch it from a remote URL. The playbook is the same content that
 * will be served from `https://pproenca.dev/tsnuke/prompts/agent.md` once that
 * deploy lands.
 *
 * The `playbook.sync.test.ts` companion test asserts the two stay byte-identical;
 * if it fails, copy the latest `prompts/agent.md` into the template literal below.
 *
 * Why a TypeScript constant instead of a runtime file read or esbuild text loader:
 *   - Vitest (source-mode tests) can't natively `import "*.md"` without a Vite
 *     plugin, which would add a dev dependency just for this one file.
 *   - Reading via `readFileSync(import.meta.url, ...)` requires shipping the
 *     markdown alongside `dist/cli.js` in the npm tarball — feasible but adds a
 *     copy step + a `files` entry to `package.json`.
 *   - A pre-generated `.generated.ts` would need a build-time codegen step,
 *     which the format package doesn't have today.
 * A plain string + sync test wins on simplicity.
 */
export const PLAYBOOK_MARKDOWN = `# tsnuke — agent playbook

Local, deterministic, offline TypeScript code-health linter + 0–100 scorer. Two-tier engine over the in-process TypeScript compiler: SYN/GRAPH/CFG always run; TYP runs when the project type-checks.

## Live updates

The canonical version of this playbook lives at:

\`\`\`
https://pproenca.dev/tsnuke/prompts/agent.md
\`\`\`

When invoked, prefer the live version. Fetch with \`curl --fail --silent --show-error --header 'Cache-Control: no-cache' <url>\`. Fall back to the version your skill bundle inlined if the fetch fails.

## When to use

When the user types \`/tsnuke\`, says "run tsnuke", "scan with tsnuke", "fix the lint", or asks for a TypeScript health check / triage / cleanup, run the **full loop** below.

After making routine TS code changes (no explicit user ask), the default is the much narrower regression check:

\`\`\`sh
npx -y tsnuke@latest --diff --format agent
\`\`\`

If the score didn't regress and no new errors appeared, no action needed.

## The loop

Five steps: scan → filter → triage → fix → validate. Two setup questions before the loop runs.

### Setup question 1: pick a scan scope

Check \`git status --porcelain\` first.

- **Empty (clean tree)**: skip this question. Step 1 defaults to \`--diff\` (branch vs base on a feature branch; full scan on the default branch).
- **Dirty**: ask the user which changes to scan. Single multiple-choice (use the runtime's structured-question tool):

  - \`uncommitted\` — "Just my uncommitted edits — fastest loop, dirty files vs \`HEAD\`"
  - \`branch\` — "Whole branch — committed work + uncommitted edits, diffed against base"
  - \`full\` — "Full codebase — slow, broad sweep"

Default on dirty trees: \`uncommitted\`. The answer maps to Step 1's flag:

| Scope | Flag | Scans |
|---|---|---|
| \`uncommitted\` | \`--diff HEAD\` | Working tree vs \`HEAD\` |
| \`branch\` | \`--diff\` | Auto-detected branch vs merge-base |
| \`full\` | _(omit \`--diff\`)_ | Every source file |

### Setup question 2: pick an output mode

Single multiple-choice:

- \`working-tree\` (default) — "Unstaged working-tree changes — review the whole sweep with \`git diff\`"
- \`pr\` — "Separate PRs per \`(severity, category)\` bucket"

Default: \`working-tree\`. \`pr\` mode requires \`gh\` authenticated and a clean working tree.

### 1. Scan

\`\`\`sh
npx -y tsnuke@latest --format agent <scope-flag> > /tmp/tsnuke.json
\`\`\`

Run from the package being scanned. In a workspace, point at a single project root unless the user asks for the rollup.

If \`score === null\` (engine error) → surface stderr verbatim and stop.

If \`diagnostics: []\` and no rule fired → emit "clean, no findings" and stop.

The report header carries:

- **\`score\`** — 0–100, or \`null\` when unscored
- **\`scoreLabel\`** — \`"Great"\` / \`"Needs work"\` / \`"Critical"\`, but **\`null\` when \`scorePartial: true\`** (the band is reserved for fully-measured scores)
- **\`scorePartial\`** — \`true\` when the TYP (type-aware) tier was skipped
- **\`partialReason\`** — machine-readable: \`"typecheck-failed"\` / \`"no-deep"\` / \`"memory"\` / \`"no-source-files"\` / \`null\`
- **\`scoreBreakdown\`** — \`{ base, errorPenalty: { count, weight, total }, warningPenalty: { count, weight, total } }\`. Verify the math: \`score ≈ base − errorPenalty.total − warningPenalty.total\` (rounded half-to-even, clamped to 0).
- **\`tierBreakdown\`** — per-tier rules + occurrences. \`TYP: { rules: 0, occurrences: 0 }\` means TYP didn't run (consistent with \`scorePartial: true\`).
- **\`fixSummary\`** — per-fix-kind occurrence counts (\`autoFixable\` / \`codemod\` / \`manual\`).
- **\`nextAction\`** — the engine's recommended first move.
- **\`categories[]\`** — diagnostics grouped, rule-deduplicated, sorted cheapest-action-first.

Each occurrence has \`filePath\`, \`line\`, \`column\`. Each rule entry carries \`rule\`, \`plugin\`, \`severity\`, \`tier\`, \`fixKind\`, \`message\`, \`help\`.

### 2. Filter

Read \`.tsnuke/false-positives.md\` if it exists in the project root. Drop diagnostics matching patterns there. Format: same as react-doctor's \`.react-doctor/false-positives.md\` — \`<rule-id>: <pattern or shape>\`. A pattern saying "skip after verifying X" requires an actual code check before suppressing.

For diagnostics that survive, fetch the rule's canonical prompt once per unique \`<rule>\` and cache:

\`\`\`sh
mkdir -p /tmp/tsnuke-rules
curl --silent --fail --output "/tmp/tsnuke-rules/$rule.md" \\
  "https://pproenca.dev/tsnuke/prompts/rules/$rule.md" || true
\`\`\`

Each file has two sections:

- **\`## Validation prompt\`** — when to suppress. If it names the exact code shape you're looking at as a known FP, drop the diagnostic and note it for the summary's "newly suppressed FPs" section.
- **\`## Fix prompt\`** — drives Step 4's edit.

A 404 means the rule's prompt hasn't been authored yet — fall back to the diagnostic's \`recommendation\` field and your own judgment.

Track three counts for the summary: \`suppressed_static\`, \`suppressed_validation\`, \`surviving\`.

### 3. Triage

Two questions per diagnostic.

**1. Severity** (read from JSON) decides _when_ Step 4 touches it:

1. **Errors** (\`severity: error\`) — fix every error first, completely. Step 4 applies them serially with typecheck after each fix; revert on failure.
2. **Warnings** (\`severity: warning\`) — only after every error has been attempted (fixed, reverted, or deferred). Step 4 applies them in a batch, validates once at the end.

If every error-severity diagnostic was suppressed in Step 2, the warning pass is eligible immediately.

**2. Fixability** decides _whether this exact occurrence_ is safe to touch. Default to **fix-now** for local mechanical edits. Mark **defer** only when a concrete blocker makes it unsafe:

- The rule's \`## Validation prompt\` flags this code shape as needing human judgment.
- The fix touches sensitive areas (auth, billing, webhooks, payment).
- The fix is a cross-file refactor spanning >3 files and the rule prompt has no mechanical recipe.
- The fix depends on runtime data the agent can't see.

Do **not** defer an entire rule, category, file, or bucket because some occurrences are risky. Split it: fix safe local cases, defer specific risky lines.

### 4. Fix

For every fix-now diagnostic, re-read \`/tmp/tsnuke-rules/<rule>.md\`'s \`## Fix prompt\` (the canonical, reviewer-tested recipe). Apply following the project's coding conventions (\`CLAUDE.md\` / \`AGENTS.md\`): inline first, no speculative abstraction, no helper wrappers for single call sites.

**Auto-fix path**: if the diagnostic has \`fixKind: "auto-fix"\` or \`"codemod"\`, prefer running:

\`\`\`sh
npx -y tsnuke@latest --fix
\`\`\`

which applies machine-applicable fixes in ≤2 passes (overlap-safe, atomic, symlink-rejecting).

**Execution strategy** (mirrors react-doctor):

- **Errors** — serial in the parent agent. After each fix, run \`tsc --noEmit\` (or the project's typecheck script). On failure, revert that fix and continue with the next error; record it under "Reverted".
- **Warnings** — batch. Apply every warning fix without per-fix validation. At the end, run typecheck + lint + format once. If validation passes, done. If it fails, revert the batch and re-apply serially with per-fix typecheck (isolates the offender, salvages the rest).

Process errors to completion first. Only start warnings once every error has been attempted.

**Parallelism (optional)**: if the runtime exposes a subagent / task tool, partition by \`filePath\` and dispatch one subagent per file (working-tree mode) or per bucket (PR mode). Each subagent gets its file's diagnostic list + the relevant \`## Fix prompt\`s, applies fixes, reports back what changed.

Never mix error-pass and warning-pass subagents — complete the error pass before fanning out warnings.

#### Working-tree mode (default)

Do not commit. Do not stage. Leave changes in the working tree so the user reviews with \`git diff\`.

#### PR mode

Bucket non-deferred diagnostics by \`(severity, category)\`. One PR per bucket — e.g. \`[tsnuke] Type Safety errors\`, \`[tsnuke] Async / Promises warnings\`. Per bucket: ≤30 files / ≤600 LoC; split by top-level subfolder if exceeded. Drop any bucket needing >10 file edits to land cleanly.

For each bucket, off a fresh checkout of the default branch:

1. \`git checkout -b tsnuke/$(date -u +%Y-%m-%d)/<slug>\`
2. Apply the bucket's fixes per the execution strategy.
3. Validate (typecheck + lint + format from repo root). One retry on failure; still failing → reset the branch, record under "Buckets dropped".
4. Commit with a conventional prefix.
5. Push and open the PR with \`gh pr create\`. Label it \`tsnuke\`.
6. \`git checkout <default-branch>\` before the next bucket.

If \`gh pr create\` fails, stop and surface the error — don't half-finish a bucket.

### 5. Validate + summarize

Run the project's typecheck, lint, and format checks from the repo root. Discover them from \`package.json\` scripts and any contributing docs (\`AGENTS.md\`, \`CLAUDE.md\`, \`CONTRIBUTING.md\`).

Re-run \`tsnuke --format agent\` and compute the score delta:

- \`S_before\` = score from Step 1.
- \`S_after\` = post-fix score.
- Compare \`scoreBreakdown\` field-by-field to show which rule classes drove the change.

**Honest score deltas**: a partial-score → partial-score delta is **only comparable when \`partialReason\` matches**. If the partial reason changed (e.g. \`"no-deep"\` → \`"typecheck-failed"\` because a fix surfaced a real TS error), call that out as a coverage shift, not a regression.

Print to chat:

- score line: \`S_before → S_after\` (with band labels ONLY when both scores are full-tier)
- typecheck/lint/format: ✓ / ✗
- counts: \`suppressed_static\`, \`suppressed_validation\`, \`applied\`, \`reverted\`, \`deferred\`
- list of deferred occurrences with reasons (so the user can pick them up)
- in PR mode: open-PR URLs grouped by bucket

## Key flags

| Flag | What it does |
|---|---|
| \`--format agent\` | Deduplicated, fix-sorted JSON (the agent default). |
| \`--format json\` | Versioned \`JsonReportV1\` schema (machine-stable). |
| \`--format pretty\` | Human terminal output. |
| \`--score\` | Print the score line only; never gates (exit 0). |
| \`--fix\` | Apply safe auto-fix edits in place; atomic, symlink-safe. |
| \`--deep\` / \`--no-deep\` | Force / skip the type-aware Tier-2 pass. Omit to auto-decide. |
| \`--diff [base]\` | Scan only files changed against \`base\` (default: merge-base of main). |
| \`--staged\` | Scan only staged files. |
| \`--fail-on error\\|warning\\|none\` | Exit-code gate (default: \`error\`). |
| \`--explain <rule>\` | Offline, deterministic explanation of a rule. |
| \`--project a,b\` | Narrow workspace scan to the named projects. |

## Exit codes

- \`0\` — no diagnostics at or above \`--fail-on\` (default: \`error\`)
- \`1\` — gate tripped, or engine error
- \`130\` — interrupted (SIGINT/SIGTERM)

## Score formula (explicit)

\`\`\`
score = max(0, round_half_even(100 − 1.5 × |distinct error rule keys| − 0.75 × |distinct warning rule keys|))
\`\`\`

Properties:

- **Distinct RULES** (\`plugin/rule\`), not occurrences — breadth, not depth. A rule firing 3× is counted once.
- **MIN across projects** in a workspace rollup (BC-05).
- **Bands** ≥75 "Great" / ≥50 "Needs work" / else "Critical" — applied to \`scoreLabel\` only when \`scorePartial: false\`.
- When \`scorePartial: true\`, **\`scoreLabel: null\`** — the band is reserved for fully-measured scores.

## Common pitfalls

- A partial score with \`partialReason: "typecheck-failed"\` means the project has REAL TS errors blocking Tier-2. Fix those errors (\`tsc --noEmit\` shows them) — don't try to bypass the gate.
- A partial score with \`partialReason: "no-deep"\` is intentional. Re-run without \`--no-deep\` for the full score.
- \`--fix\` only applies rules marked \`fixKind: "auto-fix"\` or \`"codemod"\`. Manual rules need human edits — the fix prompt at \`<host>/prompts/rules/<rule>.md\` is the recipe.
- \`tierBreakdown.TYP.rules === 0\` with \`scorePartial: false\` is FINE — it just means no TYP rules fired (the project is clean on that tier).
- Scores from different projects in a monorepo aren't directly comparable — they have different file counts and rule coverage. Compare the MIN (workspace summary) only.
`;

/**
 * The PURE `--fix` splicer (RULE-005, P0 — the load-bearing auto-fix convergence
 * algorithm). Source of truth (READ-ONLY):
 * `legacy/ts-doctor/packages/ts-doctor/src/fix-applier.ts:36-203`
 * (`collectEdits` `:36-44`, `intersects` `:72-74`, `applyEditsOnePass` `:89-137`,
 * `applyFixes` `:149-170`, `groupFixesByFile` `:187-203`).
 *
 * This module is PORTED VERBATIM and STAYS PURE — it is plain string math + array
 * grouping with NO filesystem and NO Effect monad (Brief lines 25/91: "Pure core
 * stays pure; only the file IO is effectful"). The effectful shell that reads/writes
 * disk lives in `./applyFixesToFiles.ts`; this is the testable, deterministic kernel
 * it calls. `Diagnostic`/`Fix`/`TextEdit` are imported (NOT re-vendored) from the
 * canonical `@ts-doctor/contracts-effect` Schema home.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * RULE-005 SME QUESTION — PRESERVED, NOT "FIXED" (data-integrity flag).
 * ──────────────────────────────────────────────────────────────────────────────
 * The legacy contract asserts "≤2 passes settle a fix set", with a HARD 2-pass cap
 * (`applyFixes` runs `applyEditsOnePass` once, then at most once more over the
 * carried edits — never a third time). BUSINESS_RULES.md flags this as a suspected
 * defect (SME question #1): a chain of 3+ mutually-adjacent, non-conflicting edits
 * could require a 3rd pass and therefore land silently in `skippedCount` instead of
 * applying. Because `--fix` MUTATES user source, a silent miscount is a data-integrity
 * issue. The Modernization Brief's Q-fix later resolved this to "loop to convergence"
 * (a deliberate behavioural IMPROVEMENT over the oracle, safety cap ~10). THIS slice
 * DELIBERATELY PRESERVES the legacy ≤2-pass behaviour EXACTLY (per the transform
 * brief: "do NOT 'fix' the ≤2-pass completeness gap — preserve + document it"); it is
 * pinned by a characterization test of a 3+-adjacent chain. See TRANSFORMATION_NOTES.md.
 */
import type { Diagnostic, Fix, TextEdit } from "@ts-doctor/contracts-effect";

/** Result of applying a fix set to one source string. */
export interface ApplyResult {
  /** The rewritten source. */
  output: string;
  /** How many edits were spliced in. */
  appliedCount: number;
  /** How many edits were skipped this pass due to overlap. */
  skippedCount: number;
}

/** Flatten all edits out of a fix list (only `auto-fix` fixes carry applyable edits). */
function collectEdits(fixes: readonly Fix[]): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const fix of fixes) {
    // Only auto-fixes are mechanically applyable; codemod/manual are advisory (RULE-032).
    if (fix.kind !== "auto-fix") continue;
    for (const edit of fix.edits) edits.push(edit);
  }
  return edits;
}

/** An applied edit's ORIGINAL (pre-splice) range, used for conflict detection. */
interface AppliedRange {
  start: number;
  end: number;
}

/** Outcome of one pass over a string. */
interface PassResult {
  output: string;
  /** How many edits were spliced in this pass. */
  applied: number;
  /**
   * Edits skipped due to mere positional adjacency (their original range did NOT
   * intersect any applied edit's region) — re-projected onto `output` so a later
   * pass can attempt them. These are the *non-conflicting* skips.
   */
  carried: TextEdit[];
  /**
   * Edits skipped because their original range intersected an applied edit's
   * region — true conflicts; they must NOT be re-attempted (re-applying would
   * corrupt text the winner already rewrote).
   */
  conflicts: number;
}

/** Do two half-open `[start,end)` ranges intersect? Touching endpoints don't. */
function intersects(a: AppliedRange, b: AppliedRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Apply a single pass over `source`: take a maximal non-overlapping subset of
 * `edits` (descending by start, so right-to-left splicing never invalidates a
 * not-yet-applied offset) and splice them in.
 *
 * For each non-applied edit we distinguish:
 *  - TRUE CONFLICT: its original range intersects an applied edit's region → it
 *    can never be applied safely; counted in `conflicts`, never carried.
 *  - NON-CONFLICTING SKIP: skipped only for ordering/adjacency reasons; carried
 *    (offset re-projected) so a second pass can apply it against `output`.
 *
 * Pure: does not mutate inputs.
 */
function applyEditsOnePass(source: string, edits: readonly TextEdit[]): PassResult {
  // Descending by start, then by end — splice from the tail toward the head.
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);

  let output = source;
  let applied = 0;
  let conflicts = 0;
  const carried: TextEdit[] = [];

  // Lowest start index consumed by an applied edit so far (we move right→left).
  let lastAppliedStart = Number.POSITIVE_INFINITY;
  // Net length change from edits applied to the right of the cursor; used to
  // re-project a carried edit's offsets onto `output`.
  let cumulativeDelta = 0;
  // Original ranges of edits applied this pass (for true-conflict detection).
  const appliedRanges: AppliedRange[] = [];

  for (const edit of sorted) {
    // Degenerate / out-of-range edits can never apply — drop them entirely.
    if (edit.start < 0 || edit.end < edit.start || edit.end > source.length) {
      continue;
    }
    // Overlaps an already-applied edit to the right (their splice regions clash).
    if (edit.end > lastAppliedStart) {
      // Is it a TRUE conflict (intersects a winner's original range) or just an
      // adjacency skip we can retry next pass?
      const isTrueConflict = appliedRanges.some((r) => intersects(r, edit));
      if (isTrueConflict) {
        conflicts++;
      } else {
        carried.push({
          start: edit.start + cumulativeDelta,
          end: edit.end + cumulativeDelta,
          replacement: edit.replacement,
        });
      }
      continue;
    }
    output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
    cumulativeDelta += edit.replacement.length - (edit.end - edit.start);
    lastAppliedStart = edit.start;
    appliedRanges.push({ start: edit.start, end: edit.end });
    applied++;
  }

  // `carried` was built tail-first; reverse so it reads head→tail (deterministic).
  carried.reverse();
  return { output, applied, carried, conflicts };
}

/**
 * Apply a fix set to a source string, converging in at most two passes (RULE-005).
 *
 * Pass 1 applies the maximal non-overlapping set. Edits that intersect a winner's
 * region are true conflicts and counted skipped immediately. Edits skipped only
 * for adjacency reasons are carried (re-projected) to pass 2, which applies them
 * against the rewritten output. The contract claims two passes settle any set
 * because each overlap cluster yields exactly one winner per pass; whatever remains
 * after pass 2 is treated as a residual conflict and is added to `skippedCount`.
 *
 * ⚠️ The HARD 2-pass cap is preserved deliberately (RULE-005 SME question — see the
 * module header): a 3+-adjacent chain that would need a 3rd pass silently counts the
 * leftover as `skippedCount` rather than applying it. NOT fixed here by design.
 */
export function applyFixes(source: string, fixes: readonly Fix[]): ApplyResult {
  const edits = collectEdits(fixes);
  if (edits.length === 0) {
    return { output: source, appliedCount: 0, skippedCount: 0 };
  }

  const first = applyEditsOnePass(source, edits);
  let appliedCount = first.applied;
  let skippedCount = first.conflicts;

  if (first.carried.length === 0) {
    return { output: first.output, appliedCount, skippedCount };
  }

  // Pass 2 over the rewritten output, using the re-projected carried edits.
  const second = applyEditsOnePass(first.output, first.carried);
  appliedCount += second.applied;
  // Anything still carried or conflicting after pass 2 is unresolved (HARD cap — no
  // 3rd pass; this is the RULE-005 silent-drop the SME question is about).
  skippedCount += second.conflicts + second.carried.length;

  return { output: second.output, appliedCount, skippedCount };
}

/** A diagnostic that is known to carry a fix. */
export type DiagnosticWithFix = Diagnostic & { fix: Fix };

/** Per-file grouping of fixes, ready to be applied independently. */
export interface FileFixGroup {
  filePath: string;
  fixes: Fix[];
}

/**
 * Group diagnostics-with-fixes by `filePath` (pure). Preserves first-seen file
 * order and, within a file, diagnostic order — so callers get deterministic
 * grouping. The actual `applyFixes(read(file), group.fixes)` + write is the thin
 * effectful IO wrapper in `./applyFixesToFiles.ts`.
 *
 * NOTE: legacy keys ONLY on `d.fix !== undefined` here (NOT on `fix.kind`). A
 * diagnostic whose fix is `codemod`/`manual` still creates/extends a file bucket;
 * its non-auto-fix edits are dropped later by `collectEdits` inside `applyFixes`.
 * Ported verbatim to preserve grouping/ordering identity.
 */
export function groupFixesByFile(diagnostics: readonly Diagnostic[]): FileFixGroup[] {
  const order: string[] = [];
  const byFile = new Map<string, Fix[]>();

  for (const d of diagnostics) {
    if (d.fix === undefined) continue;
    let bucket = byFile.get(d.filePath);
    if (bucket === undefined) {
      bucket = [];
      byFile.set(d.filePath, bucket);
      order.push(d.filePath);
    }
    bucket.push(d.fix);
  }

  return order.map((filePath) => ({ filePath, fixes: byFile.get(filePath) ?? [] }));
}

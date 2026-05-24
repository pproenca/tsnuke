/**
 * The `--fix` applier (C13 / BC-14, architecture-critic m2).
 *
 * A {@link Fix} carries `edits`, each a half-open `[start, end)` char-offset
 * range plus a `replacement`. Applying many edits to one string is only safe if
 * we never let one edit's splice shift the offsets another edit still refers to.
 *
 * Strategy (deterministic, convergent):
 *   1. Collect every edit (across all fixes for the file).
 *   2. SORT descending by `start` (ties: descending by `end`). Applying from the
 *      end of the string backwards means each splice cannot move the offsets of
 *      edits not yet applied — no offset drift.
 *   3. Apply non-overlapping splices. If an edit overlaps a region already
 *      consumed by an applied edit this pass, SKIP it (count it as skipped) and
 *      leave the source untouched there.
 *   4. Convergence: a second pass over the *output* re-applies edits that were
 *      only skipped because of a now-resolved neighbour. The contract guarantees
 *      ≤2 passes settle a fix set (an edit skipped twice is a true conflict).
 *
 * Everything here is pure string math — no fs. `applyFixesToFiles` groups by
 * file path (also pure); the actual disk write is a thin wrapper at the IO edge.
 */
import type { Diagnostic, Fix, TextEdit } from "@ts-doctor/rules";

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
    // Only auto-fixes are mechanically applyable; codemod/manual are advisory.
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
 * Apply a fix set to a source string, converging in at most two passes (BC-14).
 *
 * Pass 1 applies the maximal non-overlapping set. Edits that intersect a winner's
 * region are true conflicts and counted skipped immediately. Edits skipped only
 * for adjacency reasons are carried (re-projected) to pass 2, which applies them
 * against the rewritten output. Two passes settle any set because each overlap
 * cluster yields exactly one winner per pass; whatever remains after pass 2 is a
 * residual conflict and is added to `skippedCount`.
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
  // Anything still carried or conflicting after pass 2 is unresolved.
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
 * grouping. The actual `applyFixes(read(file), group.fixes)` + write is a thin
 * IO wrapper the CLI layer supplies.
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

/** Reader/writer seam injected by the CLI so the core logic stays pure/testable. */
export interface FileIo {
  read(filePath: string): string;
  write(filePath: string, contents: string): void;
}

/** Aggregate outcome of applying fixes across many files. */
export interface ApplyFilesResult {
  filesChanged: number;
  appliedCount: number;
  skippedCount: number;
}

/**
 * Apply all fixes in a diagnostic set, grouped per file, via the injected
 * {@link FileIo}. The grouping + per-file application are pure; only the
 * `io.read`/`io.write` calls touch the filesystem (the testable seam).
 */
export function applyFixesToFiles(
  diagnostics: readonly Diagnostic[],
  io: FileIo,
): ApplyFilesResult {
  const groups = groupFixesByFile(diagnostics);
  let filesChanged = 0;
  let appliedCount = 0;
  let skippedCount = 0;

  for (const group of groups) {
    const source = io.read(group.filePath);
    const result = applyFixes(source, group.fixes);
    appliedCount += result.appliedCount;
    skippedCount += result.skippedCount;
    if (result.output !== source) {
      io.write(group.filePath, result.output);
      filesChanged++;
    }
  }

  return { filesChanged, appliedCount, skippedCount };
}

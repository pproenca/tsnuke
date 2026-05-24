/**
 * Git ref-name guard (C16, BC-15). FROZEN verbatim from react-doctor.
 *
 * Validates a `--diff <base>` revision *before* it is ever passed to a git
 * subprocess, preventing argument injection (e.g. `--upload-pack=…`) and
 * dangerous refspecs. Rejects:
 *   - empty
 *   - a leading `-` (would be parsed as a git flag)
 *   - a leading or trailing `.`
 *   - containing `..` (range / parent traversal)
 *   - containing `@{` (reflog selectors)
 *   - any char outside `[A-Za-z0-9_./-]`
 *
 * See AI_NATIVE_SPEC.md §3.6 — "Freeze verbatim."
 */

const ALLOWED_REF_CHARS = /^[A-Za-z0-9_./-]+$/;

/** True iff `ref` is a safe git revision to hand to a subprocess (BC-15). */
export function isSafeGitRevision(ref: string): boolean {
  if (ref.length === 0) return false;
  if (ref.startsWith("-")) return false;
  if (ref.startsWith(".") || ref.endsWith(".")) return false;
  if (ref.includes("..")) return false;
  if (ref.includes("@{")) return false;
  if (!ALLOWED_REF_CHARS.test(ref)) return false;
  return true;
}

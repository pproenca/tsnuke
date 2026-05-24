/**
 * Zip-Slip defense for staged-file extraction (C16, BC-16). FROZEN verbatim.
 *
 * When materializing staged file contents into a temp directory, a malicious
 * relative path (`../../etc/passwd`, an absolute path, …) must never escape the
 * temp dir. `isInsideTempDir` resolves both paths and verifies the candidate
 * stays strictly inside `tempDir`.
 *
 * See AI_NATIVE_SPEC.md §3 — "Freeze verbatim."
 */

import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * True iff joining `relPath` under `tempDir` stays inside `tempDir` (BC-16).
 *
 * Rejects absolute candidate paths and any path that, once resolved, lands at
 * or above `tempDir` (i.e. the relative path from tempDir to the target starts
 * with `..` or is itself absolute).
 */
export function isInsideTempDir(tempDir: string, relPath: string): boolean {
  // An absolute candidate is never "relative to" the temp dir — reject outright.
  if (isAbsolute(relPath)) return false;

  const base = resolve(tempDir);
  const target = resolve(base, relPath);

  // Same dir is allowed; anything resolving above it is not.
  if (target === base) return true;

  const rel = relative(base, target);
  if (rel.length === 0) return true;
  if (rel === "..") return false;
  if (rel.startsWith(`..${sep}`)) return false;
  if (isAbsolute(rel)) return false;
  return true;
}

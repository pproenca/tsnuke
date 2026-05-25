/**
 * Pure path-containment predicate for the CWE-59 cure (out-of-root rejection).
 *
 * Mirrors the `isInsideTempDir` reasoning from the `security/effect` slice
 * (`modernized/security/effect/src/main/StagedFiles.ts`, itself a verbatim port of
 * legacy `packages/core/src/security/staged-files.ts`): resolve both paths and verify
 * the candidate stays AT or strictly INSIDE the root. Here the candidate is an
 * absolute target file rather than a relative member, so the shape differs slightly,
 * but the resolve→relative→reject-`..`/absolute logic is the same defense.
 *
 * PURE: `node:path` calls are string operations (no FS access), so this is a plain
 * synchronous predicate — NOT `Effect`-wrapped (Brief lines 25/91: pure core stays
 * pure; only the file IO is effectful).
 */

import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * True iff `candidate` resolves to a path AT or strictly INSIDE `root`.
 *
 * Rejects (returns `false`) any candidate that, once resolved against `root`,
 * lands above the root (`..`-escape) or on a different drive/root. Both inputs are
 * resolved first so `.`/`..` segments and relative candidates are normalized.
 */
export function isInsideRoot(root: string, candidate: string): boolean {
  const base = resolve(root);
  const target = resolve(base, candidate);

  // Same dir is allowed; anything resolving above it is not.
  if (target === base) return true;

  const rel = relative(base, target);
  if (rel.length === 0) return true;
  if (rel === "..") return false;
  if (rel.startsWith(`..${sep}`)) return false;
  // On Windows `relative` across drives yields an absolute path → outside.
  if (isAbsolute(rel)) return false;
  return true;
}

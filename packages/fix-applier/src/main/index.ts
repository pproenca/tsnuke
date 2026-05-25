/**
 * `@ts-doctor/fix-applier-effect` — public surface of the Effect-TS `--fix` slice.
 *
 * RULE-005 (auto-fix convergence, ≤2 passes — P0) + RULE-032 (only `auto-fix` kind is
 * mechanically applied), split into:
 *   - PURE core: `applyFixes` / `groupFixesByFile` (`applyFixes.ts`) — plain
 *     synchronous string math + grouping, ported VERBATIM from legacy. NO Effect.
 *     The ≤2-pass cap (and its documented RULE-005 SME completeness gap) is preserved
 *     exactly, not "fixed".
 *   - EFFECTFUL shell: `applyFixesToFiles` / `applyFixesToFilesDetailed`
 *     (`applyFixesToFiles.ts`) — an `Effect<...>` over `@effect/platform`
 *     `FileSystem` + `Path` that reads/writes disk, curing CWE-59 (symlink +
 *     out-of-root reject, no-follow) and the non-atomic write (temp-then-`rename`)
 *     over legacy's direct `io.write`. Provide a Layer at the edge: `NodeContext`
 *     (production) or an in-memory stub (tests). The `*Node` helpers run it on disk.
 *
 * The `Diagnostic`/`Fix`/`TextEdit` contracts are re-exported from the canonical
 * `@ts-doctor/contracts-effect` (NOT re-vendored here).
 */

export {
  applyFixes,
  groupFixesByFile,
  type ApplyResult,
  type DiagnosticWithFix,
  type FileFixGroup,
} from "./applyFixes.js";

export { isInsideRoot } from "./pathContainment.js";

export {
  applyFixesToFiles,
  applyFixesToFilesDetailed,
  applyFixesToFilesNode,
  applyFixesToFilesDetailedNode,
  NodeContext,
  type ApplyFilesResult,
  type ApplyFilesDetailedResult,
  type WriteRejection,
} from "./applyFixesToFiles.js";

// Canonical domain contracts (re-exported, not re-vendored).
export { Diagnostic, Fix, TextEdit, FixKind } from "@ts-doctor/contracts-effect";

// Self-barrel: opt-in namespace import (`import { FixApplier } from "..."`). ADDITIVE —
// the named re-exports above remain the byte-stable surface every consumer imports from.
export * as FixApplier from "./index.js";

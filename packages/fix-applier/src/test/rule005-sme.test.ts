/**
 * RULE-005 SME CONCERN — pinned, NOT fixed (data-integrity flag).
 *
 * BUSINESS_RULES.md SME question #1 asks: "Can a chain of 3 or more mutually-adjacent,
 * non-conflicting edits ever require a 3rd pass?" If yes, the hard ≤2-pass cap silently
 * drops valid edits into `skippedCount` — and `--fix` mutates user source, so a miscount
 * is a data-integrity issue.
 *
 * This suite DOCUMENTS the legacy algorithm's actual convergence behaviour (preserved
 * verbatim here) so the rewrite's choice (the Brief's Q-fix: loop-to-convergence) can be
 * made against an evidenced baseline. The transform brief is explicit: PRESERVE the
 * ≤2-pass behaviour exactly here; do NOT "fix" it. These tests assert WHAT LEGACY DOES.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * FINDING (sharper than the SME question): the pass-2 / `carried` path is DEAD CODE.
 * ──────────────────────────────────────────────────────────────────────────────
 * Edits are sorted DESCENDING by `start`, so the winner applied first always has the
 * LARGER (or equal) start. A loser is only skipped when `loser.end > winner.start`. But
 * because `loser.start <= winner.start < winner.end`, that skip condition ALSO implies
 * `loser.start < winner.end` AND `winner.start < loser.end` — which is exactly the
 * `intersects` predicate. Therefore EVERY skip is classified a TRUE CONFLICT and
 * `carried` is ALWAYS empty; `applyFixes` returns after pass 1 and pass 2 never runs.
 * (Proven exhaustively over all 1-/2-/3-edit sets on a length-6 source — see the
 * trace in TRANSFORMATION_NOTES.md.) So the real RULE-005 shape is: ONE winner per
 * overlap cluster, ALL other overlappers dropped as conflicts in a single pass; the
 * "≤2 passes settle any set" convergence story is not actually exercised. The 3+-edit
 * SME concern manifests as "extra overlappers silently counted in skippedCount", which
 * these tests pin. We preserve this EXACTLY.
 */

import { describe, expect, it } from "vitest";
import { applyFixes } from "../main/applyFixes.js";
import type { Fix, TextEdit } from "@ts-doctor/contracts-effect";

const autoFix = (...edits: TextEdit[]): Fix => ({ kind: "auto-fix", edits });
const edit = (start: number, end: number, replacement: string): TextEdit => ({
  start,
  end,
  replacement,
});

describe("RULE-005 SME — 3+ mutually-ADJACENT (touching) edits all apply in pass 1", () => {
  it("three touching edits [0,2)[2,4)[4,6) all apply (no carry needed — they never overlap)", () => {
    // Touching endpoints do NOT intersect (strict <), and `end == lastAppliedStart` is
    // NOT `> lastAppliedStart`, so each applies. This is the BENIGN case: adjacency
    // alone never needs a 2nd pass. Documents that the "adjacency" framing in the rule
    // text does not, by itself, produce a carry.
    const result = applyFixes("ABCDEF", [
      autoFix(edit(0, 2, "11"), edit(2, 4, "22"), edit(4, 6, "33")),
    ]);
    expect(result).toEqual({ output: "112233", appliedCount: 3, skippedCount: 0 });
  });

  it("three touching edits supplied out of order still all apply (descending sort)", () => {
    const result = applyFixes("ABCDEF", [
      autoFix(edit(4, 6, "33")),
      autoFix(edit(0, 2, "11")),
      autoFix(edit(2, 4, "22")),
    ]);
    expect(result).toEqual({ output: "112233", appliedCount: 3, skippedCount: 0 });
  });

  it("three touching edits with growing replacements all apply (offset drift handled)", () => {
    const result = applyFixes("abc", [
      autoFix(edit(0, 1, "XX"), edit(1, 2, "YYY"), edit(2, 3, "Z")),
    ]);
    expect(result).toEqual({ output: "XXYYYZ", appliedCount: 3, skippedCount: 0 });
  });
});

describe("RULE-005 SME — a 3-edit OVERLAP cluster keeps ONE winner, drops the rest as conflicts (pass-1 only; carry is dead code)", () => {
  it("three mutually-overlapping edits: rightmost-start winner applied, other two are conflicts", () => {
    // (0,4),(2,6),(4,8) on an 8-char source. Descending by start → (4,8) applied first
    // ("4567"→"C") → "0123C"; (2,6) end 6 > lastAppliedStart 4 AND intersects (4,8)
    // original → conflict; (0,4) end 4 NOT > 4 → applied ("0123"→"A") → "AC".
    // So 2 applied, 1 conflict — and crucially NO pass 2 (carried stays empty).
    const result = applyFixes("01234567", [
      autoFix(edit(0, 4, "A"), edit(2, 6, "B"), edit(4, 8, "C")),
    ]);
    expect(result).toEqual({ output: "AC", appliedCount: 2, skippedCount: 1 });
  });

  it("a tight overlap cluster of 3 around one point → 1 applied, 2 dropped (silent skip the SME flags)", () => {
    // (0,3),(1,4),(2,5) on "abcde". Descending → (2,5) applied ("cde"→"X") → "abX";
    // (1,4) end 4 > 2 AND intersects (2,5) → conflict; (0,3) end 3 > 2 AND intersects
    // (2,5) → conflict. Result: 1 applied, 2 skipped. These 2 are NEVER retried (no
    // pass 2) — the data-integrity concern the SME question is about.
    const result = applyFixes("abcde", [
      autoFix(edit(0, 3, "P"), edit(1, 4, "Q"), edit(2, 5, "X")),
    ]);
    expect(result).toEqual({ output: "abX", appliedCount: 1, skippedCount: 2 });
  });
});

describe("RULE-005 SME — the pass-2 / carried machinery is unreachable (documented dead code, preserved)", () => {
  it("no constructible edit set reaches pass 2: skipped edits are ALWAYS conflicts, never carried", () => {
    // We cannot construct a carry (proven exhaustively in TRANSFORMATION_NOTES.md). The
    // observable contract: for ANY overlapping set, skippedCount counts pure conflicts
    // and the output equals the pass-1 output. We assert a representative set's output
    // is stable and matches a single-pass mental model (winner-per-cluster).
    const result = applyFixes("0123456789", [
      autoFix(
        edit(0, 5, "L"), // start 0
        edit(3, 8, "M"), // start 3 — overlaps L
        edit(6, 10, "R"), // start 6 — overlaps M
      ),
    ]);
    // Descending: (6,10) applied ("6789"→"R") → "012345R"; (3,8) end 8 > 6 ∩ (6,10) →
    // conflict; (0,5) end 5 NOT > 6 → applied ("01234"→"L") → "L5R" (the "5" survives).
    // 2 applied, 1 conflict, no pass 2.
    expect(result).toEqual({ output: "L5R", appliedCount: 2, skippedCount: 1 });
  });
});

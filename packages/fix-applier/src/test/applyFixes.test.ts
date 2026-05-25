/**
 * Characterization + equivalence tests for the PURE `--fix` splicer
 * (`src/main/applyFixes.ts`, RULE-005 / RULE-032). No legacy `fix-applier.test.ts`
 * exists in the source tree, so these vectors are DERIVED from the documented rule
 * behaviour (BUSINESS_RULES.md RULE-005/032) and the legacy algorithm's invariants,
 * then PINNED against a frozen vendored copy of legacy `applyFixes`/`groupFixesByFile`
 * in the equivalence section below.
 *
 * Covered: non-overlapping edits applied; true conflict dropped+counted; degenerate
 * edits dropped; touching endpoints NOT a conflict (strict `<`); the 2-pass adjacency
 * carry; only `auto-fix` collected; empty → no-op; grouping order. The RULE-005 SME
 * concern (3+-mutually-adjacent chain) is pinned in `rule005-sme.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { applyFixes, groupFixesByFile } from "../main/applyFixes.js";
import type { Diagnostic, Fix, TextEdit } from "@ts-doctor/contracts-effect";

/** Build an `auto-fix` Fix from a list of edits. */
const autoFix = (...edits: TextEdit[]): Fix => ({ kind: "auto-fix", edits });
const edit = (start: number, end: number, replacement: string): TextEdit => ({
  start,
  end,
  replacement,
});

// ===========================================================================
// applyFixes — pass 1 / non-overlapping / conflict / degenerate / kind filter
// ===========================================================================
describe("applyFixes — basic splicing", () => {
  it("empty fix list → no-op (output === source, counts 0)", () => {
    expect(applyFixes("hello", [])).toEqual({
      output: "hello",
      appliedCount: 0,
      skippedCount: 0,
    });
  });

  it("a fix with zero edits → no-op", () => {
    expect(applyFixes("hello", [autoFix()])).toEqual({
      output: "hello",
      appliedCount: 0,
      skippedCount: 0,
    });
  });

  it("single edit spliced in", () => {
    // "let x" → "const x"
    const result = applyFixes("let x", [autoFix(edit(0, 3, "const"))]);
    expect(result).toEqual({ output: "const x", appliedCount: 1, skippedCount: 0 });
  });

  it("two non-overlapping edits both applied (right-to-left, no offset drift)", () => {
    // source "aXbYc": replace X(1,2)→"1" and Y(3,4)→"2"
    const result = applyFixes("aXbYc", [
      autoFix(edit(1, 2, "1"), edit(3, 4, "2")),
    ]);
    expect(result).toEqual({ output: "a1b2c", appliedCount: 2, skippedCount: 0 });
  });

  it("non-overlapping edits applied regardless of input order (sorted descending internally)", () => {
    // same as above but edits supplied in head→tail order
    const result = applyFixes("aXbYc", [
      autoFix(edit(3, 4, "2")),
      autoFix(edit(1, 2, "1")),
    ]);
    expect(result).toEqual({ output: "a1b2c", appliedCount: 2, skippedCount: 0 });
  });

  it("replacement of differing length applied correctly across edits", () => {
    // "0123456789": edit (6,8)→"XX..X" (4 chars) and (2,3)→"Y"
    const result = applyFixes("0123456789", [
      autoFix(edit(2, 3, "Y"), edit(6, 8, "XXXX")),
    ]);
    // tail edit first: 6..8 "67"→"XXXX" → "012345XXXX89"; then 2..3 "2"→"Y" → "01Y345XXXX89"
    expect(result).toEqual({
      output: "01Y345XXXX89",
      appliedCount: 2,
      skippedCount: 0,
    });
  });
});

describe("applyFixes — conflicts (true intersection → dropped + counted)", () => {
  it("two edits with intersecting original ranges → one applied, one counted as conflict", () => {
    // (0,3) and (2,5) intersect (2 < 3). Descending by start → (2,5) applied first,
    // then (0,3) has end 3 > lastAppliedStart 2 and intersects → conflict.
    const result = applyFixes("abcdef", [
      autoFix(edit(0, 3, "X"), edit(2, 5, "Y")),
    ]);
    // (2,5) "cde"→"Y": "abYf"; (0,3) conflicts → skipped.
    expect(result).toEqual({ output: "abYf", appliedCount: 1, skippedCount: 1 });
  });

  it("fully-nested edit is a conflict (inner intersects outer's original range)", () => {
    // outer (0,6), inner (2,4): inner is inside outer → intersect.
    const result = applyFixes("abcdef", [
      autoFix(edit(0, 6, "WHOLE"), edit(2, 4, "x")),
    ]);
    // descending by start: (2,4) applied first → "abxef"; then (0,6) end 6 >
    // lastAppliedStart 2 AND intersects (2,4) original → conflict.
    expect(result.appliedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.output).toBe("abxef");
  });
});

describe("applyFixes — touching endpoints do NOT intersect (strict <)", () => {
  it("adjacent edits sharing an endpoint are BOTH applied (no conflict)", () => {
    // (0,2) and (2,4) touch at offset 2 but [0,2) and [2,4) do not intersect.
    const result = applyFixes("abcd", [
      autoFix(edit(0, 2, "X"), edit(2, 4, "Y")),
    ]);
    expect(result).toEqual({ output: "XY", appliedCount: 2, skippedCount: 0 });
  });

  it("zero-width insertion at the seam of an adjacent edit is not a conflict", () => {
    // (2,2) pure insertion + (0,2) replacement: end 2 == lastAppliedStart 2, NOT > .
    const result = applyFixes("abcd", [
      autoFix(edit(0, 2, "X"), edit(2, 2, "+")),
    ]);
    // (2,2) insert "+" first → "ab+cd"; then (0,2) "ab"→"X" → "X+cd".
    expect(result).toEqual({ output: "X+cd", appliedCount: 2, skippedCount: 0 });
  });
});

describe("applyFixes — degenerate / out-of-range edits dropped (not counted skipped)", () => {
  it("start < 0 dropped", () => {
    const result = applyFixes("abc", [autoFix(edit(-1, 1, "X"))]);
    expect(result).toEqual({ output: "abc", appliedCount: 0, skippedCount: 0 });
  });

  it("end < start dropped", () => {
    const result = applyFixes("abc", [autoFix(edit(2, 1, "X"))]);
    expect(result).toEqual({ output: "abc", appliedCount: 0, skippedCount: 0 });
  });

  it("end > source.length dropped", () => {
    const result = applyFixes("abc", [autoFix(edit(0, 99, "X"))]);
    expect(result).toEqual({ output: "abc", appliedCount: 0, skippedCount: 0 });
  });

  it("a degenerate edit alongside a valid one: valid applied, degenerate silently dropped", () => {
    const result = applyFixes("abc", [autoFix(edit(0, 1, "X"), edit(5, 9, "Z"))]);
    expect(result).toEqual({ output: "Xbc", appliedCount: 1, skippedCount: 0 });
  });
});

describe("applyFixes — only auto-fix edits collected (RULE-032)", () => {
  it("codemod and manual fixes contribute NO edits", () => {
    const codemod: Fix = { kind: "codemod", edits: [edit(0, 1, "X")] };
    const manual: Fix = { kind: "manual", edits: [edit(1, 2, "Y")] };
    const result = applyFixes("abc", [codemod, manual]);
    expect(result).toEqual({ output: "abc", appliedCount: 0, skippedCount: 0 });
  });

  it("mixed: only the auto-fix's edits are applied; codemod's are ignored", () => {
    const result = applyFixes("abc", [
      { kind: "codemod", edits: [edit(0, 1, "Z")] },
      autoFix(edit(2, 3, "Y")),
    ]);
    expect(result).toEqual({ output: "abY", appliedCount: 1, skippedCount: 0 });
  });
});

describe("applyFixes — equal-start ties resolve by descending end (pass-1 only)", () => {
  it("two edits with the SAME start: wider one wins, narrower one is a conflict", () => {
    // ties sort descending by end → (0,4) before (0,2). (0,4) "abcd"→"A" applied,
    // lastAppliedStart 0. (0,2) end 2 > 0 AND original (0,2) intersects (0,4) → conflict.
    const result = applyFixes("abcd", [
      autoFix(edit(0, 2, "B"), edit(0, 4, "A")),
    ]);
    expect(result).toEqual({ output: "A", appliedCount: 1, skippedCount: 1 });
  });

  it("a zero-width insert that ties a winner's START applies (end NOT > lastAppliedStart)", () => {
    // (0,2) and (0,0): descending end → (0,2) first, applied, lastAppliedStart 0.
    // (0,0) insert: end 0 is NOT > 0 → applied too → "<AAcd".
    const result = applyFixes("abcd", [
      autoFix(edit(0, 2, "AA"), edit(0, 0, "<")),
    ]);
    expect(result).toEqual({ output: "<AAcd", appliedCount: 2, skippedCount: 0 });
  });
});

// ===========================================================================
// groupFixesByFile — grouping + ordering (RULE-005 / pure)
// ===========================================================================
const diag = (filePath: string, fix?: Fix): Diagnostic => ({
  filePath,
  plugin: "ts-doctor",
  rule: "r",
  severity: "warning",
  message: "m",
  help: "h",
  line: 1,
  column: 1,
  category: "c",
  tier: "SYN",
  ...(fix ? { fix } : {}),
});

describe("groupFixesByFile", () => {
  it("empty input → empty groups", () => {
    expect(groupFixesByFile([])).toEqual([]);
  });

  it("diagnostics with no fix are skipped (no bucket created)", () => {
    expect(groupFixesByFile([diag("a.ts"), diag("b.ts")])).toEqual([]);
  });

  it("groups by filePath, preserving first-seen file order and within-file order", () => {
    const fA1 = autoFix(edit(0, 1, "1"));
    const fB1 = autoFix(edit(0, 1, "2"));
    const fA2 = autoFix(edit(1, 2, "3"));
    const groups = groupFixesByFile([
      diag("a.ts", fA1),
      diag("b.ts", fB1),
      diag("a.ts", fA2),
    ]);
    expect(groups).toEqual([
      { filePath: "a.ts", fixes: [fA1, fA2] },
      { filePath: "b.ts", fixes: [fB1] },
    ]);
  });

  it("buckets on `fix !== undefined` only — a codemod/manual fix still creates a bucket (verbatim legacy)", () => {
    const codemod: Fix = { kind: "codemod", edits: [edit(0, 1, "X")] };
    const groups = groupFixesByFile([diag("a.ts", codemod)]);
    expect(groups).toEqual([{ filePath: "a.ts", fixes: [codemod] }]);
  });
});

// ===========================================================================
// EQUIVALENCE PROOF — modern applyFixes/groupFixesByFile vs FROZEN legacy oracle.
//
// A verbatim, frozen copy of legacy `fix-applier.ts:36-203` (the pure functions),
// inlined below. Both sides run over the SAME crafted edit/diagnostic sets; we assert
// `output`/`appliedCount`/`skippedCount` (and grouping) deep-equal. Because the modern
// applyFixes is a verbatim port, this proves byte-for-byte behavioral equivalence —
// the whole point of porting the load-bearing algorithm unchanged.
// ===========================================================================

// ---- FROZEN LEGACY ORACLE (verbatim fix-applier.ts:36-203) ----
function legacy_collectEdits(fixes: readonly Fix[]): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const fix of fixes) {
    if (fix.kind !== "auto-fix") continue;
    for (const e of fix.edits) edits.push(e);
  }
  return edits;
}
interface LAppliedRange {
  start: number;
  end: number;
}
interface LPassResult {
  output: string;
  applied: number;
  carried: TextEdit[];
  conflicts: number;
}
function legacy_intersects(a: LAppliedRange, b: LAppliedRange): boolean {
  return a.start < b.end && b.start < a.end;
}
function legacy_applyEditsOnePass(source: string, edits: readonly TextEdit[]): LPassResult {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let output = source;
  let applied = 0;
  let conflicts = 0;
  const carried: TextEdit[] = [];
  let lastAppliedStart = Number.POSITIVE_INFINITY;
  let cumulativeDelta = 0;
  const appliedRanges: LAppliedRange[] = [];
  for (const e of sorted) {
    if (e.start < 0 || e.end < e.start || e.end > source.length) continue;
    if (e.end > lastAppliedStart) {
      const isTrueConflict = appliedRanges.some((r) => legacy_intersects(r, e));
      if (isTrueConflict) {
        conflicts++;
      } else {
        carried.push({
          start: e.start + cumulativeDelta,
          end: e.end + cumulativeDelta,
          replacement: e.replacement,
        });
      }
      continue;
    }
    output = output.slice(0, e.start) + e.replacement + output.slice(e.end);
    cumulativeDelta += e.replacement.length - (e.end - e.start);
    lastAppliedStart = e.start;
    appliedRanges.push({ start: e.start, end: e.end });
    applied++;
  }
  carried.reverse();
  return { output, applied, carried, conflicts };
}
function legacy_applyFixes(
  source: string,
  fixes: readonly Fix[],
): { output: string; appliedCount: number; skippedCount: number } {
  const edits = legacy_collectEdits(fixes);
  if (edits.length === 0) return { output: source, appliedCount: 0, skippedCount: 0 };
  const first = legacy_applyEditsOnePass(source, edits);
  let appliedCount = first.applied;
  let skippedCount = first.conflicts;
  if (first.carried.length === 0) return { output: first.output, appliedCount, skippedCount };
  const second = legacy_applyEditsOnePass(first.output, first.carried);
  appliedCount += second.applied;
  skippedCount += second.conflicts + second.carried.length;
  return { output: second.output, appliedCount, skippedCount };
}
function legacy_groupFixesByFile(
  diagnostics: readonly Diagnostic[],
): Array<{ filePath: string; fixes: Fix[] }> {
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
// ---- END FROZEN LEGACY ORACLE ----

describe("EQUIVALENCE — modern applyFixes deep-equals frozen legacy oracle", () => {
  const fixtures: ReadonlyArray<{ name: string; source: string; fixes: Fix[] }> = [
    { name: "empty", source: "hello", fixes: [] },
    { name: "single", source: "let x", fixes: [autoFix(edit(0, 3, "const"))] },
    {
      name: "two non-overlapping",
      source: "aXbYc",
      fixes: [autoFix(edit(1, 2, "1"), edit(3, 4, "2"))],
    },
    {
      name: "intersecting conflict",
      source: "abcdef",
      fixes: [autoFix(edit(0, 3, "X"), edit(2, 5, "Y"))],
    },
    {
      name: "nested conflict",
      source: "abcdef",
      fixes: [autoFix(edit(0, 6, "WHOLE"), edit(2, 4, "x"))],
    },
    {
      name: "touching endpoints both apply",
      source: "abcd",
      fixes: [autoFix(edit(0, 2, "X"), edit(2, 4, "Y"))],
    },
    {
      name: "zero-width insert at seam",
      source: "abcd",
      fixes: [autoFix(edit(0, 2, "X"), edit(2, 2, "+"))],
    },
    {
      name: "degenerate dropped, valid kept",
      source: "abc",
      fixes: [autoFix(edit(0, 1, "X"), edit(5, 9, "Z"))],
    },
    { name: "all degenerate", source: "abc", fixes: [autoFix(edit(-1, 1, "X"), edit(2, 1, "Q"))] },
    {
      name: "kind filter (codemod/manual ignored)",
      source: "abc",
      fixes: [
        { kind: "codemod", edits: [edit(0, 1, "Z")] },
        { kind: "manual", edits: [edit(1, 2, "M")] },
        autoFix(edit(2, 3, "Y")),
      ],
    },
    {
      name: "differing-length replacements",
      source: "0123456789",
      fixes: [autoFix(edit(2, 3, "Y"), edit(6, 8, "XXXX"))],
    },
    {
      name: "three adjacent (SME chain — preserve whatever legacy does)",
      source: "ABCDEF",
      fixes: [autoFix(edit(0, 2, "11"), edit(2, 4, "22"), edit(4, 6, "33"))],
    },
    {
      name: "four edits mixed orderings",
      source: "0123456789",
      fixes: [
        autoFix(edit(8, 9, "h")),
        autoFix(edit(0, 1, "a")),
        autoFix(edit(4, 5, "e")),
        autoFix(edit(2, 3, "c")),
      ],
    },
  ];

  for (const { name, source, fixes } of fixtures) {
    it(`oracle parity (applyFixes): ${name}`, () => {
      expect(applyFixes(source, fixes)).toStrictEqual(legacy_applyFixes(source, fixes));
    });
  }
});

describe("EQUIVALENCE — modern groupFixesByFile deep-equals frozen legacy oracle", () => {
  const fA = autoFix(edit(0, 1, "1"));
  const fB: Fix = { kind: "codemod", edits: [edit(0, 1, "c")] };
  const fC = autoFix(edit(1, 2, "3"));
  const fixtures: ReadonlyArray<{ name: string; diagnostics: Diagnostic[] }> = [
    { name: "empty", diagnostics: [] },
    { name: "all no-fix", diagnostics: [diag("a.ts"), diag("b.ts")] },
    {
      name: "multi-file interleaved",
      diagnostics: [diag("a.ts", fA), diag("b.ts", fB), diag("a.ts", fC), diag("c.ts", fA)],
    },
    {
      name: "no-fix interleaved with fixes",
      diagnostics: [diag("a.ts"), diag("a.ts", fA), diag("b.ts"), diag("b.ts", fC)],
    },
  ];
  for (const { name, diagnostics } of fixtures) {
    it(`oracle parity (groupFixesByFile): ${name}`, () => {
      expect(groupFixesByFile(diagnostics)).toStrictEqual(legacy_groupFixesByFile(diagnostics));
    });
  }
});

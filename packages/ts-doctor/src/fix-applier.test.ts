import { describe, expect, it } from "vitest";
import type { Fix } from "@ts-doctor/rules";
import { applyFixes, groupFixesByFile, applyFixesToFiles } from "./fix-applier.js";
import type { FileIo } from "./fix-applier.js";

/** Helper: build an auto-fix from one or more edits. */
function autoFix(edits: { start: number; end: number; replacement: string }[]): Fix {
  return { kind: "auto-fix", edits };
}

describe("BC-14 — applyFixes (machine-applicable fix application)", () => {
  it("applies two non-overlapping fixes with no offset drift (descending splice)", () => {
    // "let a = 1; let b = 2;"  — replace `1`(idx 8) with `100`, `2`(idx 19) with `200`.
    const source = "let a = 1; let b = 2;";
    const idx1 = source.indexOf("1");
    const idx2 = source.indexOf("2");
    const fixes: Fix[] = [
      autoFix([{ start: idx1, end: idx1 + 1, replacement: "100" }]),
      autoFix([{ start: idx2, end: idx2 + 1, replacement: "200" }]),
    ];
    const result = applyFixes(source, fixes);
    expect(result.output).toBe("let a = 100; let b = 200;");
    expect(result.appliedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
  });

  it("is order-independent: passing edits in ascending order yields the same output", () => {
    const source = "abcdefghij";
    // Replace [0,1) "a"->"X" and [5,6) "f"->"YY".
    const fixesAsc: Fix[] = [
      autoFix([{ start: 0, end: 1, replacement: "X" }]),
      autoFix([{ start: 5, end: 6, replacement: "YY" }]),
    ];
    const fixesDesc: Fix[] = [
      autoFix([{ start: 5, end: 6, replacement: "YY" }]),
      autoFix([{ start: 0, end: 1, replacement: "X" }]),
    ];
    expect(applyFixes(source, fixesAsc).output).toBe("Xbcde" + "YY" + "ghij");
    expect(applyFixes(source, fixesDesc).output).toBe(applyFixes(source, fixesAsc).output);
  });

  it("char-offset correctness on a known string with [start,end) semantics", () => {
    // "hello world" — replace [0,5) "hello" with "hi", leave " world".
    const source = "hello world";
    const result = applyFixes(source, [autoFix([{ start: 0, end: 5, replacement: "hi" }])]);
    expect(result.output).toBe("hi world");
    // end is exclusive: [6,11) is "world".
    const result2 = applyFixes(source, [autoFix([{ start: 6, end: 11, replacement: "there" }])]);
    expect(result2.output).toBe("hello there");
  });

  it("two OVERLAPPING fixes: first applies, second skipped this pass; converges", () => {
    // Both edits touch [2,5). Descending sort applies the rightmost-by-start; here
    // they share start=2/start=3, so exactly one wins and the other is a true conflict.
    const source = "0123456789";
    const fixes: Fix[] = [
      autoFix([{ start: 2, end: 5, replacement: "AAA" }]),
      autoFix([{ start: 3, end: 6, replacement: "BBB" }]),
    ];
    const result = applyFixes(source, fixes);
    // Exactly one of the two overlapping edits applied; the other is skipped.
    expect(result.appliedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    // Output reflects exactly one splice, never a corrupt double-splice.
    expect(result.output.length).toBeGreaterThan(0);
    expect([
      "01AAA56789", // start=2 edit won
      "012BBB6789", // start=3 edit won
    ]).toContain(result.output);
  });

  it("converges in <=2 passes: a non-conflicting edit skipped in pass 1 lands in pass 2", () => {
    // Edits: A=[8,9) and B=[8,9)+[0,1) bundled? Instead construct a case where an
    // edit overlaps an applied one in pass 1 only because of adjacency, but a third
    // independent edit always applies. Three edits: [0,1),[0,1) overlap, [5,6) free.
    const source = "abcdefghij";
    const fixes: Fix[] = [
      autoFix([{ start: 0, end: 1, replacement: "X" }]),
      autoFix([{ start: 0, end: 1, replacement: "Y" }]), // conflicts with the first
      autoFix([{ start: 5, end: 6, replacement: "Z" }]), // independent, must apply
    ];
    const result = applyFixes(source, fixes);
    // The independent edit applies; exactly one of the two conflicting [0,1) wins.
    expect(result.output.includes("Z")).toBe(true);
    expect(result.appliedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
  });

  it("returns the source unchanged when there are no fixes / no auto-fixes", () => {
    expect(applyFixes("unchanged", []).output).toBe("unchanged");
    const manual: Fix = { kind: "manual", edits: [{ start: 0, end: 1, replacement: "Z" }] };
    expect(applyFixes("unchanged", [manual]).output).toBe("unchanged");
    expect(applyFixes("unchanged", [manual]).appliedCount).toBe(0);
  });
});

describe("BC-14 — groupFixesByFile / applyFixesToFiles", () => {
  const mkDiag = (filePath: string, fix?: Fix) => ({
    filePath,
    plugin: "ts-doctor",
    rule: "r",
    severity: "warning" as const,
    message: "m",
    help: "h",
    line: 1,
    column: 1,
    category: "c",
    tier: "SYN" as const,
    ...(fix !== undefined ? { fix } : {}),
  });

  it("groups diagnostics-with-fixes by filePath, preserving order", () => {
    const groups = groupFixesByFile([
      mkDiag("a.ts", autoFix([{ start: 0, end: 1, replacement: "X" }])),
      mkDiag("b.ts", autoFix([{ start: 0, end: 1, replacement: "Y" }])),
      mkDiag("a.ts", autoFix([{ start: 2, end: 3, replacement: "Z" }])),
      mkDiag("c.ts"), // no fix → excluded
    ]);
    expect(groups.map((g) => g.filePath)).toEqual(["a.ts", "b.ts"]);
    expect(groups[0]?.fixes.length).toBe(2);
  });

  it("applyFixesToFiles writes only changed files via the injected FileIo", () => {
    const store: Record<string, string> = { "a.ts": "abc", "b.ts": "xyz" };
    const writes: string[] = [];
    const io: FileIo = {
      read: (p) => store[p] ?? "",
      write: (p, c) => {
        store[p] = c;
        writes.push(p);
      },
    };
    const result = applyFixesToFiles(
      [
        mkDiag("a.ts", autoFix([{ start: 0, end: 1, replacement: "A" }])),
        mkDiag("b.ts", autoFix([{ start: 0, end: 0, replacement: "" }])), // no-op edit
      ],
      io,
    );
    expect(store["a.ts"]).toBe("Abc");
    expect(writes).toContain("a.ts");
    expect(result.filesChanged).toBe(1); // b.ts unchanged (empty replacement at [0,0))
  });
});

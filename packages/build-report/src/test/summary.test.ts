/**
 * Characterization tests for the report `summary` rollup — RULE-004.
 *
 * These tests DEFINE "done" for the Effect-TS rewrite: the implementation in
 * `../main/index.js` is written AFTER these tests and must make them pass.
 *
 * RULE-004 (summary counts & rollup):
 *   - `errorCount`           = occurrences with `severity === "error"`
 *   - `warningCount`         = ALL other occurrences (binary split, same as RULE-001)
 *   - `affectedFileCount`    = size of the set of DISTINCT `filePath`s
 *   - `totalDiagnosticCount` = total OCCURRENCES (NOT distinct rules) ⚠ see defect note
 *   - `summary.score`        = MIN over per-project scores (RULE-003, via score slice)
 *   - `summary.scoreLabel`   = label of `summary.score`, only when score !== null
 *   - `summary.scorePartial` = logical OR over projects
 *
 * ⚠ SUSPECTED DEFECT (RULE-004): two distinct counting semantics coexist — the
 * SCORE counts DISTINCT rules (RULE-001) while `totalDiagnosticCount` counts
 * OCCURRENCES. They are NOT interchangeable; a dedicated test below pins that they
 * differ.
 *
 * ⚠ WIRE-COMPAT (RULE-034): the score slice's result field is named `band`, but the
 * report wire field is `scoreLabel`. The builder maps `band` → the `scoreLabel`
 * wire field; these tests assert the WIRE name `scoreLabel`.
 */

import { describe, expect, it } from "vitest";
import { buildReport } from "../main/index.js";
import type { BuildReportInput, Diagnostic } from "../main/index.js";

/**
 * Build a plain Diagnostic literal (structural typing). Only the fields the
 * summary reads (`severity`, `filePath`) matter; the rest are realistic filler.
 */
function diag(
  over: Partial<Diagnostic> & Pick<Diagnostic, "rule" | "severity" | "filePath">,
): Diagnostic {
  return {
    plugin: "tsnuke",
    message: "m",
    help: "h",
    line: 1,
    column: 1,
    category: "c",
    tier: "SYN",
    ...over,
  };
}

/** Minimal full-mode input with a single project's diagnostics + score. */
function inputWith(
  projects: BuildReportInput["projects"],
  over: Partial<BuildReportInput> = {},
): BuildReportInput {
  return {
    version: "1.0.0",
    directory: "/repo",
    mode: "full",
    projects,
    elapsedMilliseconds: 10,
    ...over,
  };
}

describe("summary — RULE-004 (error/warning occurrence split)", () => {
  it("errorCount counts severity==='error' occurrences; warningCount counts the rest", () => {
    const report = buildReport(
      inputWith([
        {
          directory: "/repo/a",
          diagnostics: [
            diag({ rule: "r1", severity: "error", filePath: "/a/x.ts" }),
            diag({ rule: "r2", severity: "error", filePath: "/a/y.ts" }),
            diag({ rule: "r3", severity: "warning", filePath: "/a/z.ts" }),
          ],
          score: 90,
          scorePartial: false,
          skippedChecks: [],
          elapsedMilliseconds: 5,
        },
      ]),
    );
    expect(report.summary.errorCount).toBe(2);
    expect(report.summary.warningCount).toBe(1);
  });

  it("any non-'error' severity falls into the warning bucket (binary split)", () => {
    const report = buildReport(
      inputWith([
        {
          directory: "/repo/a",
          diagnostics: [
            // an out-of-contract severity is bucketed as a warning (legacy parity).
            diag({ rule: "r1", severity: "info" as Diagnostic["severity"], filePath: "/a/x.ts" }),
            diag({ rule: "r2", severity: "warning", filePath: "/a/y.ts" }),
          ],
          score: 90,
          scorePartial: false,
          skippedChecks: [],
          elapsedMilliseconds: 5,
        },
      ]),
    );
    expect(report.summary.errorCount).toBe(0);
    expect(report.summary.warningCount).toBe(2);
  });
});

describe("summary — RULE-004 (affectedFileCount = distinct filePaths)", () => {
  it("counts the set of distinct filePaths, not occurrences", () => {
    const report = buildReport(
      inputWith([
        {
          directory: "/repo/a",
          diagnostics: [
            diag({ rule: "r1", severity: "error", filePath: "/a/x.ts" }),
            diag({ rule: "r2", severity: "warning", filePath: "/a/x.ts" }), // same file
            diag({ rule: "r3", severity: "warning", filePath: "/a/y.ts" }),
          ],
          score: 90,
          scorePartial: false,
          skippedChecks: [],
          elapsedMilliseconds: 5,
        },
      ]),
    );
    // 3 occurrences but only 2 distinct files.
    expect(report.summary.totalDiagnosticCount).toBe(3);
    expect(report.summary.affectedFileCount).toBe(2);
  });

  it("distinct filePaths are counted across the FLAT union of all projects", () => {
    const report = buildReport(
      inputWith([
        {
          directory: "/repo/a",
          diagnostics: [diag({ rule: "r1", severity: "error", filePath: "/a/x.ts" })],
          score: 90,
          scorePartial: false,
          skippedChecks: [],
          elapsedMilliseconds: 5,
        },
        {
          directory: "/repo/b",
          diagnostics: [
            diag({ rule: "r2", severity: "warning", filePath: "/b/x.ts" }),
            diag({ rule: "r3", severity: "warning", filePath: "/a/x.ts" }), // dup path across projects
          ],
          score: 80,
          scorePartial: false,
          skippedChecks: [],
          elapsedMilliseconds: 5,
        },
      ]),
    );
    expect(report.summary.affectedFileCount).toBe(2); // /a/x.ts, /b/x.ts
  });
});

describe("summary — RULE-004 (totalDiagnosticCount = OCCURRENCES, not distinct rules)", () => {
  // ⚠ The flagged defect: pin that totalDiagnosticCount counts OCCURRENCES while
  // the score would count DISTINCT rules. The SAME rule firing 3× must count as 3
  // occurrences in the summary (even though it would be a single distinct rule for
  // scoring).
  it("the same plugin/rule firing 3x counts as 3 occurrences (distinct-rule count would be 1)", () => {
    const report = buildReport(
      inputWith([
        {
          directory: "/repo/a",
          diagnostics: [
            diag({ rule: "no-any", severity: "error", filePath: "/a/x.ts", line: 1 }),
            diag({ rule: "no-any", severity: "error", filePath: "/a/x.ts", line: 5 }),
            diag({ rule: "no-any", severity: "error", filePath: "/a/x.ts", line: 9 }),
          ],
          score: 98,
          scorePartial: false,
          skippedChecks: [],
          elapsedMilliseconds: 5,
        },
      ]),
    );
    // distinct rules = 1, but occurrences = 3. totalDiagnosticCount MUST be 3.
    expect(report.summary.totalDiagnosticCount).toBe(3);
    expect(report.summary.errorCount).toBe(3);
    // affected files = 1 (all in /a/x.ts) — yet another distinct counting axis.
    expect(report.summary.affectedFileCount).toBe(1);
  });
});

describe("summary — RULE-004/003 (score = MIN over projects, via the score slice)", () => {
  it("summary.score is the MIN of per-project scores", () => {
    const report = buildReport(
      inputWith([
        { directory: "/a", diagnostics: [], score: 90, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
        { directory: "/b", diagnostics: [], score: 40, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
        { directory: "/c", diagnostics: [], score: 70, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
      ]),
    );
    expect(report.summary.score).toBe(40);
  });

  it("null per-project scores are skipped in the MIN", () => {
    const report = buildReport(
      inputWith([
        { directory: "/a", diagnostics: [], score: 90, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
        { directory: "/b", diagnostics: [], score: null, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
        { directory: "/c", diagnostics: [], score: 55, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
      ]),
    );
    expect(report.summary.score).toBe(55);
  });

  it("all-null scores -> summary.score is null and scoreLabel is null", () => {
    const report = buildReport(
      inputWith([
        { directory: "/a", diagnostics: [], score: null, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
        { directory: "/b", diagnostics: [], score: null, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
      ]),
    );
    expect(report.summary.score).toBeNull();
    expect(report.summary.scoreLabel).toBeNull();
  });

  it("no projects -> summary.score is null and scoreLabel is null", () => {
    const report = buildReport(inputWith([]));
    expect(report.summary.score).toBeNull();
    expect(report.summary.scoreLabel).toBeNull();
  });
});

describe("summary — RULE-004/002 (scoreLabel WIRE field: band->scoreLabel, only when score !== null)", () => {
  it("scoreLabel is set from the MIN score's band when score !== null", () => {
    const report = buildReport(
      inputWith([
        { directory: "/a", diagnostics: [], score: 90, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
        { directory: "/b", diagnostics: [], score: 40, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
      ]),
    );
    // MIN = 40 -> band "Critical" -> wire field `scoreLabel`.
    expect(report.summary.score).toBe(40);
    expect(report.summary.scoreLabel).toBe("Critical");
  });

  it("scoreLabel tracks the band cutoffs (75 Great / 50 Needs work / else Critical)", () => {
    const great = buildReport(
      inputWith([{ directory: "/a", diagnostics: [], score: 75, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 }]),
    );
    const needsWork = buildReport(
      inputWith([{ directory: "/a", diagnostics: [], score: 50, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 }]),
    );
    const critical = buildReport(
      inputWith([{ directory: "/a", diagnostics: [], score: 49, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 }]),
    );
    expect(great.summary.scoreLabel).toBe("Great");
    expect(needsWork.summary.scoreLabel).toBe("Needs work");
    expect(critical.summary.scoreLabel).toBe("Critical");
  });
});

describe("summary — RULE-004 (scorePartial = logical OR over projects)", () => {
  it("scorePartial is true if ANY project is partial", () => {
    const report = buildReport(
      inputWith([
        { directory: "/a", diagnostics: [], score: 90, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
        { directory: "/b", diagnostics: [], score: 80, scorePartial: true, skippedChecks: [], elapsedMilliseconds: 1 },
      ]),
    );
    expect(report.summary.scorePartial).toBe(true);
  });

  it("scorePartial is false when NO project is partial", () => {
    const report = buildReport(
      inputWith([
        { directory: "/a", diagnostics: [], score: 90, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
        { directory: "/b", diagnostics: [], score: 80, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
      ]),
    );
    expect(report.summary.scorePartial).toBe(false);
  });

  it("scorePartial is false for an empty project list", () => {
    const report = buildReport(inputWith([]));
    expect(report.summary.scorePartial).toBe(false);
  });
});

describe("summary — RULE-004 (empty diagnostics)", () => {
  it("zero diagnostics -> all counts are 0", () => {
    const report = buildReport(
      inputWith([
        { directory: "/a", diagnostics: [], score: 100, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
      ]),
    );
    expect(report.summary.errorCount).toBe(0);
    expect(report.summary.warningCount).toBe(0);
    expect(report.summary.affectedFileCount).toBe(0);
    expect(report.summary.totalDiagnosticCount).toBe(0);
  });
});

/**
 * Characterization tests for `buildReport` — RULE-034 (schema version & `ok`)
 * plus the report-level carry/flatten behavior (RULE-004, RULE-033).
 *
 * RULE-034:
 *   - `schemaVersion = 1` (const; bump + add a union arm on breaking change)
 *   - `ok = (error === null)`
 *
 * Report-level behavior preserved from legacy `build-report.ts:93-124`:
 *   - top-level `diagnostics` = FLAT union of every project's diagnostics
 *   - `diff = input.diff ?? null`
 *   - `mode`, `version`, `directory`, `elapsedMilliseconds` carried verbatim
 *   - `projects` carried as per-project entries (directory/diagnostics/score/
 *     scorePartial/skippedChecks/elapsedMilliseconds)
 */

import { describe, expect, it } from "vitest";
import { buildReport, JSON_REPORT_SCHEMA_VERSION } from "../main/index.js";
import type { BuildReportInput, Diagnostic } from "../main/index.js";

function diag(
  over: Partial<Diagnostic> & Pick<Diagnostic, "rule" | "severity" | "filePath">,
): Diagnostic {
  return {
    plugin: "ts-doctor",
    message: "m",
    help: "h",
    line: 1,
    column: 1,
    category: "c",
    tier: "SYN",
    ...over,
  } as Diagnostic;
}

function inputWith(over: Partial<BuildReportInput> = {}): BuildReportInput {
  return {
    version: "1.0.0",
    directory: "/repo",
    mode: "full",
    projects: [],
    elapsedMilliseconds: 10,
    ...over,
  };
}

describe("buildReport — RULE-034 (schemaVersion const)", () => {
  it("schemaVersion is always 1", () => {
    const report = buildReport(inputWith());
    expect(report.schemaVersion).toBe(1);
    expect(report.schemaVersion).toBe(JSON_REPORT_SCHEMA_VERSION);
  });

  it("exports JSON_REPORT_SCHEMA_VERSION = 1", () => {
    expect(JSON_REPORT_SCHEMA_VERSION).toBe(1);
  });
});

describe("buildReport — RULE-034 (ok = error === null)", () => {
  it("ok is true when no error is supplied", () => {
    expect(buildReport(inputWith()).ok).toBe(true);
  });

  it("ok is true when error is explicitly null", () => {
    expect(buildReport(inputWith({ error: null })).ok).toBe(true);
  });

  it("ok is false when an error is supplied; error is carried", () => {
    const report = buildReport(
      inputWith({ error: { message: "boom", name: "Error", chain: [] } }),
    );
    expect(report.ok).toBe(false);
    expect(report.error).toStrictEqual({ message: "boom", name: "Error", chain: [] });
  });

  it("error defaults to null when omitted", () => {
    expect(buildReport(inputWith()).error).toBeNull();
  });
});

describe("buildReport — RULE-004 (flat diagnostics union)", () => {
  it("top-level diagnostics is the flat concatenation of all projects, in order", () => {
    const a1 = diag({ rule: "r1", severity: "error", filePath: "/a/x.ts" });
    const a2 = diag({ rule: "r2", severity: "warning", filePath: "/a/y.ts" });
    const b1 = diag({ rule: "r3", severity: "error", filePath: "/b/x.ts" });
    const report = buildReport(
      inputWith({
        projects: [
          { directory: "/a", diagnostics: [a1, a2], score: 90, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
          { directory: "/b", diagnostics: [b1], score: 80, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 },
        ],
      }),
    );
    expect(report.diagnostics).toStrictEqual([a1, a2, b1]);
    expect(report.diagnostics).toHaveLength(3);
  });

  it("empty projects -> empty flat diagnostics", () => {
    expect(buildReport(inputWith()).diagnostics).toStrictEqual([]);
  });
});

describe("buildReport — RULE-033 (mode + diff carry)", () => {
  it("mode is carried verbatim (full)", () => {
    expect(buildReport(inputWith({ mode: "full" })).mode).toBe("full");
  });

  it("mode is carried verbatim (diff) and diff metadata flows through", () => {
    const diff = {
      baseBranch: "main",
      currentBranch: "feature",
      changedFileCount: 3,
      isCurrentChanges: false,
    };
    const report = buildReport(inputWith({ mode: "diff", diff }));
    expect(report.mode).toBe("diff");
    expect(report.diff).toStrictEqual(diff);
  });

  it("diff defaults to null when omitted (full mode)", () => {
    expect(buildReport(inputWith()).diff).toBeNull();
  });

  it("diff is null when explicitly null", () => {
    expect(buildReport(inputWith({ diff: null })).diff).toBeNull();
  });
});

describe("buildReport — RULE-004 (project + scalar carry)", () => {
  it("carries version, directory, elapsedMilliseconds verbatim", () => {
    const report = buildReport(
      inputWith({ version: "2.3.4", directory: "/some/root", elapsedMilliseconds: 1234 }),
    );
    expect(report.version).toBe("2.3.4");
    expect(report.directory).toBe("/some/root");
    expect(report.elapsedMilliseconds).toBe(1234);
  });

  it("projects entries carry directory/diagnostics/score/scorePartial/skippedChecks/elapsedMilliseconds", () => {
    const d = diag({ rule: "r", severity: "error", filePath: "/a/x.ts" });
    const report = buildReport(
      inputWith({
        projects: [
          {
            directory: "/a",
            diagnostics: [d],
            score: 73,
            scorePartial: true,
            skippedChecks: ["TYP"],
            elapsedMilliseconds: 42,
          },
        ],
      }),
    );
    expect(report.projects).toStrictEqual([
      {
        directory: "/a",
        diagnostics: [d],
        score: 73,
        scorePartial: true,
        skippedChecks: ["TYP"],
        elapsedMilliseconds: 42,
      },
    ]);
  });
});

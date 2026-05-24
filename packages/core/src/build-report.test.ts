import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@ts-doctor/rules";
import {
  JSON_REPORT_SCHEMA_VERSION,
  buildReport,
  serializeError,
  type BuildReportProject,
} from "./build-report.js";

function diag(over: Partial<Diagnostic> & Pick<Diagnostic, "rule" | "severity" | "filePath">): Diagnostic {
  return {
    plugin: "ts-doctor",
    message: "m",
    help: "h",
    line: 1,
    column: 1,
    category: "Type Safety",
    tier: "SYN",
    ...over,
  };
}

function project(over: Partial<BuildReportProject> & Pick<BuildReportProject, "directory">): BuildReportProject {
  return {
    diagnostics: [],
    score: null,
    scorePartial: false,
    skippedChecks: [],
    elapsedMilliseconds: 0,
    ...over,
  };
}

describe("buildReport (BC-23)", () => {
  it("emits schemaVersion 1 and a correct summary", () => {
    const diagnostics = [
      diag({ rule: "no-any", severity: "error", filePath: "/x/a.ts" }),
      diag({ rule: "no-any", severity: "error", filePath: "/x/a.ts" }),
      diag({ rule: "prefer-type", severity: "warning", filePath: "/x/b.ts" }),
    ];
    const report = buildReport({
      version: "0.0.0",
      directory: "/x",
      mode: "full",
      projects: [project({ directory: "/x", diagnostics, score: 96, scorePartial: false })],
      elapsedMilliseconds: 12,
    });

    expect(report.schemaVersion).toBe(JSON_REPORT_SCHEMA_VERSION);
    expect(report.schemaVersion).toBe(1);
    expect(report.ok).toBe(true);
    expect(report.summary.errorCount).toBe(2);
    expect(report.summary.warningCount).toBe(1);
    expect(report.summary.totalDiagnosticCount).toBe(3);
    expect(report.summary.affectedFileCount).toBe(2); // a.ts + b.ts
    expect(report.summary.score).toBe(96);
    expect(report.summary.scoreLabel).toBe("Great");
    expect(report.summary.scorePartial).toBe(false);
    expect(report.diagnostics).toHaveLength(3);
  });

  it("monorepo summary score = MIN over scored projects; partial if any is partial (BC-05)", () => {
    const report = buildReport({
      version: "0.0.0",
      directory: "/repo",
      mode: "full",
      projects: [
        project({ directory: "/repo/a", score: 90, scorePartial: false }),
        project({ directory: "/repo/b", score: 40, scorePartial: true }),
        project({ directory: "/repo/c", score: null, scorePartial: false }),
      ],
      elapsedMilliseconds: 0,
    });
    expect(report.summary.score).toBe(40); // min over {90, 40}; null skipped
    expect(report.summary.scorePartial).toBe(true); // project b is partial
    expect(report.projects).toHaveLength(3);
  });

  it("ok is false and error is carried when a run fails", () => {
    const report = buildReport({
      version: "0.0.0",
      directory: "/x",
      mode: "full",
      projects: [],
      elapsedMilliseconds: 0,
      error: serializeError(new Error("boom")),
    });
    expect(report.ok).toBe(false);
    expect(report.error?.message).toBe("boom");
    expect(report.summary.score).toBeNull();
    expect(report.summary.scoreLabel).toBeNull();
  });

  it("serializeError flattens the cause chain root-last", () => {
    const root = new Error("root");
    const mid = new Error("mid", { cause: root });
    const top = new Error("top", { cause: mid });
    const ser = serializeError(top);
    expect(ser.message).toBe("top");
    expect(ser.chain).toEqual(["mid", "root"]);
  });
});

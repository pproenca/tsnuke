/**
 * Workspace-mode behavioral tests for `runInspect` (BC-05). When the `analyze` seam
 * returns a multi-project `WorkspaceResult`, the handler renders a per-project breakdown +
 * a min-score summary (pretty), the min score (`--score`), and an N-project rollup report
 * (`--json`); the exit-code gate runs over ALL members' diagnostics.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runInspect } from "../main/inspectHandler.js";
import type { InspectFlags } from "../main/flags.js";
import { diag, makeCapturingIo, project, result, workspace } from "./fixtures.js";

const flags = (over: Partial<InspectFlags> = {}): InspectFlags => ({
  directory: "/ws",
  lint: true,
  deadCode: true,
  deep: undefined,
  verbose: false,
  respectInlineDisables: true,
  score: false,
  showScore: true,
  json: false,
  jsonCompact: false,
  format: "pretty",
  annotations: false,
  prComment: false,
  fix: false,
  yes: false,
  full: false,
  projects: [],
  diff: undefined,
  staged: false,
  failOn: "error",
  explain: undefined,
  why: undefined,
  ...over,
});

/** A 2-project workspace: a clean one (100) and one with an error diagnostic (60). */
const twoProjectWs = () =>
  workspace("/ws", [
    result({
      project: { ...project, rootDirectory: "/ws/packages/clean" },
      score: { score: 100, label: "Great", partial: false },
    }),
    result({
      project: { ...project, rootDirectory: "/ws/packages/messy" },
      score: { score: 60, label: "Needs work", partial: false },
      diagnostics: [
        diag({ filePath: "/ws/packages/messy/src/x.ts", severity: "error", rule: "no-floating-promises" }),
      ],
    }),
  ]);

describe("workspace mode — pretty", () => {
  it("renders a section per project + a min-score workspace summary", async () => {
    const io = makeCapturingIo(twoProjectWs());
    await Effect.runPromise(runInspect(flags(), io, "0.0.0"));
    const text = io.out.join("");
    // per-project headers (relative to the workspace root)
    expect(text).toContain("packages/clean");
    expect(text).toContain("packages/messy");
    // the BC-05 summary: 2 projects, min score 60
    expect(text).toContain("Workspace: 2 project(s)");
    expect(text).toContain("60/100");
    expect(text).toContain("1 error(s)");
  });
});

describe("workspace mode — --score", () => {
  it("prints only the MIN score across members", async () => {
    const io = makeCapturingIo(twoProjectWs());
    await Effect.runPromise(runInspect(flags({ score: true }), io, "0.0.0"));
    expect(io.out.join("")).toBe("Score: 60/100 — Needs work\n");
  });
});

describe("workspace mode — --json", () => {
  it("emits an N-project report with the min-score summary", async () => {
    const io = makeCapturingIo(twoProjectWs());
    await Effect.runPromise(runInspect(flags({ json: true }), io, "9.9.9"));
    const report = JSON.parse(io.out.join(""));
    expect(report.version).toBe("9.9.9");
    expect(report.directory).toBe("/ws");
    expect(report.projects).toHaveLength(2);
    expect(report.projects.map((p: { directory: string }) => p.directory)).toStrictEqual([
      "/ws/packages/clean",
      "/ws/packages/messy",
    ]);
    expect(report.summary.score).toBe(60); // MIN over members (RULE-003)
    expect(report.summary.errorCount).toBe(1);
  });
});

describe("workspace mode — exit code", () => {
  it("gates on ALL members' diagnostics (an error in any member → exit 1)", async () => {
    const io = makeCapturingIo(twoProjectWs());
    const code = await Effect.runPromise(runInspect(flags({ failOn: "error" }), io, "0.0.0"));
    expect(code).toBe(1);
  });

  it("--score never fails even with member errors", async () => {
    const io = makeCapturingIo(twoProjectWs());
    const code = await Effect.runPromise(
      runInspect(flags({ score: true, failOn: "error" }), io, "0.0.0"),
    );
    expect(code).toBe(0);
  });
});

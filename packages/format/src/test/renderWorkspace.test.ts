import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@tsnuke/contracts-effect";
import {
  renderWorkspacePretty,
  worstProject,
  type WorkspaceProjectView,
  type WorkspaceView,
} from "../main/renderWorkspace.js";
import type { RenderScoreResult } from "../main/render.js";

function diag(over: Partial<Diagnostic> & Pick<Diagnostic, "rule">): Diagnostic {
  return {
    filePath: "/ws/p/src/a.ts",
    plugin: "tsnuke",
    severity: "warning",
    message: `msg-${over.rule}`,
    help: `help-${over.rule}`,
    line: 1,
    column: 1,
    category: "Type Safety",
    tier: "SYN",
    ...over,
  };
}

function project(
  over: Partial<WorkspaceProjectView> & Pick<WorkspaceProjectView, "rootDirectory">,
): WorkspaceProjectView {
  return {
    score: { score: 100, label: "Great", partial: false },
    scorePartial: false,
    diagnostics: [],
    elapsedMilliseconds: 100,
    ...over,
  };
}

function ws(over: Partial<WorkspaceView> & { projects: ReadonlyArray<WorkspaceProjectView> }): WorkspaceView {
  return {
    rootDirectory: "/ws",
    elapsedMilliseconds: 1000,
    ...over,
  };
}

const summary = (score: number, label: string, partial = false): RenderScoreResult => ({ score, label, partial });

describe("renderWorkspacePretty — summary header", () => {
  it("emits one-line header: Workspace · count · score band", () => {
    const out = renderWorkspacePretty(
      ws({ projects: [project({ rootDirectory: "/ws/a", score: summary(80, "Great") })] }),
      summary(80, "Great"),
    );
    expect(out).toContain("Workspace  /ws");
    expect(out).toContain("1 project");
    expect(out).toContain("80/100");
    expect(out).toContain("Great");
    expect(out).not.toContain("╭─────╮"); // the 4-line nuke panel is workspace-mode-suppressed
  });

  it("tilde-ifies the workspace path when homeDir is provided", () => {
    const out = renderWorkspacePretty(
      ws({ rootDirectory: "/Users/p/proj/repo", projects: [project({ rootDirectory: "/Users/p/proj/repo/a" })] }),
      summary(100, "Great"),
      { homeDir: "/Users/p" },
    );
    expect(out).toContain("~/proj/repo");
    expect(out).not.toContain("/Users/p/proj/repo  ");
  });

  it("marks partial summary score with a trailing star", () => {
    const out = renderWorkspacePretty(
      ws({ projects: [project({ rootDirectory: "/ws/a", scorePartial: true })] }),
      summary(80, "Great", true),
    );
    expect(out).toContain("80/100*");
  });
});

describe("renderWorkspacePretty — table sort + columns", () => {
  it("sorts worst-first (lowest score first; ties broken by error count then total)", () => {
    const out = renderWorkspacePretty(
      ws({
        projects: [
          project({ rootDirectory: "/ws/a", score: summary(100, "Great") }),
          project({
            rootDirectory: "/ws/b",
            score: summary(60, "Needs work"),
            diagnostics: [diag({ rule: "r", severity: "error" })],
          }),
          project({ rootDirectory: "/ws/c", score: summary(80, "Great") }),
        ],
      }),
      summary(60, "Needs work"),
    );
    expect(out.indexOf("\n  ▸ b")).toBeGreaterThan(-1);
    expect(out.indexOf("\n  ▸ b")).toBeLessThan(out.indexOf("\n  ▸ c"));
    expect(out.indexOf("\n  ▸ c")).toBeLessThan(out.indexOf("\n  ▸ a"));
  });

  it("right-aligns score / err / warn columns regardless of dir length", () => {
    const out = renderWorkspacePretty(
      ws({
        projects: [
          project({
            rootDirectory: "/ws/short",
            score: summary(90, "Great"),
            diagnostics: [diag({ rule: "r" })],
          }),
          project({
            rootDirectory: "/ws/this-is-a-very-long-package-name",
            score: summary(70, "Needs work"),
            diagnostics: Array.from({ length: 137 }, (_, i) =>
              diag({ rule: "r", filePath: `/ws/lp/src/${i}.ts` }),
            ),
          }),
        ],
      }),
      summary(70, "Needs work"),
    );
    const rows = out.split("\n").filter((l) => l.startsWith("  ▸ "));
    expect(rows).toHaveLength(2);
    const [first, second] = rows;
    if (first === undefined || second === undefined) throw new Error("expected 2 rows");
    // The "score" digits should sit at the same column across rows.
    const scoreCol = (line: string): number => line.search(/\b\d{2,3}\b/);
    expect(scoreCol(first)).toBe(scoreCol(second));
  });

  it("collapses to top-N when project count exceeds the threshold; --all expands", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      project({
        rootDirectory: `/ws/p${String(i).padStart(2, "0")}`,
        score: summary(90 + (i % 10), "Great"),
      }),
    );
    const collapsed = renderWorkspacePretty(ws({ projects: many }), summary(90, "Great"));
    expect(collapsed).toContain("more project");
    expect(collapsed).toContain("(--all to expand)");
    // The truncated view shouldn't list every project.
    const visibleRows = collapsed.split("\n").filter((l) => l.startsWith("  ▸ ")).length;
    expect(visibleRows).toBeLessThan(20);

    const expanded = renderWorkspacePretty(ws({ projects: many }), summary(90, "Great"), {
      showAll: true,
    });
    expect(expanded).not.toContain("(--all to expand)");
    const allRows = expanded.split("\n").filter((l) => l.startsWith("  ▸ ")).length;
    expect(allRows).toBe(20);
  });
});

describe("renderWorkspacePretty — footer + CTA", () => {
  it("footer carries the total counts with thousands separators + version + duration", () => {
    const diagnostics = Array.from({ length: 1234 }, (_, i) =>
      diag({ rule: "r", filePath: `/ws/a/src/${i}.ts` }),
    );
    const out = renderWorkspacePretty(
      ws({
        projects: [project({ rootDirectory: "/ws/a", score: summary(75, "Great"), diagnostics })],
        elapsedMilliseconds: 27_100,
      }),
      summary(75, "Great"),
      { version: "0.3.0" },
    );
    expect(out).toContain("1,234 issues");
    expect(out).toContain("tsnuke 0.3.0");
    expect(out).toContain("27.1s");
  });

  it("CTA names the focus rule and its package distribution", () => {
    const out = renderWorkspacePretty(
      ws({
        projects: [
          project({
            rootDirectory: "/ws/a",
            score: summary(80, "Great"),
            diagnostics: [
              diag({ rule: "no-non-null-assertion", filePath: "/ws/a/src/1.ts" }),
              diag({ rule: "no-non-null-assertion", filePath: "/ws/a/src/2.ts" }),
            ],
          }),
          project({
            rootDirectory: "/ws/b",
            score: summary(85, "Great"),
            diagnostics: [diag({ rule: "no-non-null-assertion", filePath: "/ws/b/src/x.ts" })],
          }),
          project({
            rootDirectory: "/ws/c",
            score: summary(90, "Great"),
            diagnostics: [diag({ rule: "some-other-rule" })],
          }),
        ],
      }),
      summary(80, "Great"),
    );
    expect(out).toContain("Start with `no-non-null-assertion`");
    expect(out).toContain("3 occurrences");
    expect(out).toContain("across 2 projects");
  });

  it("shows the partial-score legend only when at least one project is partial", () => {
    const partialOut = renderWorkspacePretty(
      ws({
        projects: [
          project({ rootDirectory: "/ws/a", scorePartial: true, score: summary(80, "Great", true) }),
        ],
      }),
      summary(80, "Great", true),
    );
    expect(partialOut).toContain("* partial score");

    const allFullOut = renderWorkspacePretty(
      ws({ projects: [project({ rootDirectory: "/ws/a" })] }),
      summary(100, "Great"),
    );
    expect(allFullOut).not.toContain("* partial score");
  });

  it("clean workspace shows the all-clear line", () => {
    const out = renderWorkspacePretty(
      ws({ projects: [project({ rootDirectory: "/ws/a" })] }),
      summary(100, "Great"),
    );
    expect(out).toContain("All clear");
  });
});

describe("renderWorkspacePretty — colour discipline", () => {
  it("plain ASCII when color=false; embeds ANSI when color=true", () => {
    const view = ws({
      projects: [
        project({ rootDirectory: "/ws/a", score: summary(60, "Needs work"), diagnostics: [diag({ rule: "r" })] }),
      ],
    });
    const plain = renderWorkspacePretty(view, summary(60, "Needs work"));
    const coloured = renderWorkspacePretty(view, summary(60, "Needs work"), { color: true });
    expect(plain).not.toContain("\x1b[");
    expect(coloured).toContain("\x1b[");
  });
});

describe("worstProject", () => {
  it("picks the project with the lowest score", () => {
    const projects = [
      project({ rootDirectory: "/ws/a", score: summary(90, "Great") }),
      project({ rootDirectory: "/ws/b", score: summary(40, "Critical") }),
      project({ rootDirectory: "/ws/c", score: summary(70, "Needs work") }),
    ];
    expect(worstProject(ws({ projects }))?.rootDirectory).toBe("/ws/b");
  });
});

/**
 * The `inspect` handler (`runInspect`) — behavioral tests over the injectable IO seam.
 *
 * Asserts the CLI SELECTS and EMITS the right output for each format (delegating the
 * content to the proven format slice), toggles indentation / score visibility correctly,
 * resolves exit codes per RULE-030, and wires `--fix` to the applier. No real process /
 * disk — the seam is a capturing in-memory one.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runInspect } from "../main/inspectHandler.js";
import type { InspectFlags } from "../main/flags.js";
import { diag, makeCapturingIo, result } from "./fixtures.js";

const flags = (over: Partial<InspectFlags> = {}): InspectFlags => ({
  directory: "/proj",
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
  color: false,
  full: false,
  projects: [],
  diff: undefined,
  staged: false,
  failOn: "error",
  explain: undefined,
  why: undefined,
  ...over,
});

describe("output formats — the CLI selects + emits the right one", () => {
  it("pretty (default): score header + diagnostics from the format slice", async () => {
    const io = makeCapturingIo(result({ diagnostics: [diag()] }));
    await Effect.runPromise(runInspect(flags(), io, "0.0.0"));
    const text = io.out.join("");
    expect(text).toContain("100 / 100"); // header bar score
    expect(text).toContain("Great"); // label
    expect(text).toContain("no-any"); // rule id present
    expect(text).toContain("1 issue across 1 file"); // pretty footer
  });

  it("pretty + --no-score (showScore=false) omits the score header", async () => {
    const io = makeCapturingIo(result({ diagnostics: [diag()] }));
    await Effect.runPromise(runInspect(flags({ showScore: false }), io, "0.0.0"));
    expect(io.out.join("")).not.toContain("Score:");
  });

  it("--score: only the score line, never the pretty body", async () => {
    const io = makeCapturingIo(result({ diagnostics: [diag()] }));
    await Effect.runPromise(runInspect(flags({ score: true }), io, "0.0.0"));
    const text = io.out.join("");
    expect(text.trim()).toBe("Score: 100/100 — Great");
  });

  it("--json: emits the versioned report (schemaVersion, mode, summary)", async () => {
    const io = makeCapturingIo(result({ diagnostics: [diag({ severity: "error" })] }));
    await Effect.runPromise(runInspect(flags({ json: true }), io, "0.0.0"));
    const parsed = JSON.parse(io.out.join(""));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.mode).toBe("full");
    expect(parsed.version).toBe("0.0.0");
    expect(parsed.summary.errorCount).toBe(1);
    expect(parsed.projects).toHaveLength(1);
  });

  it("--json-compact toggles indentation (no newlines/spaces) vs --json", async () => {
    const ioPretty = makeCapturingIo(result({ diagnostics: [diag()] }));
    await Effect.runPromise(runInspect(flags({ json: true }), ioPretty, "0.0.0"));
    const ioCompact = makeCapturingIo(result({ diagnostics: [diag()] }));
    await Effect.runPromise(
      runInspect(flags({ json: true, jsonCompact: true }), ioCompact, "0.0.0"),
    );
    expect(ioPretty.out.join("")).toContain("\n  "); // indented
    expect(ioCompact.out.join("")).not.toContain("\n  "); // single-line
    // Both parse to the SAME object.
    expect(JSON.parse(ioCompact.out.join(""))).toEqual(JSON.parse(ioPretty.out.join("")));
  });

  it("--json mode label reflects --staged / --diff (RULE-033 labels)", async () => {
    const ioStaged = makeCapturingIo(result());
    await Effect.runPromise(
      runInspect(flags({ json: true, staged: true }), ioStaged, "0.0.0"),
    );
    expect(JSON.parse(ioStaged.out.join("")).mode).toBe("staged");
    const ioDiff = makeCapturingIo(result());
    await Effect.runPromise(
      runInspect(flags({ json: true, diff: { base: "main" } }), ioDiff, "0.0.0"),
    );
    expect(JSON.parse(ioDiff.out.join("")).mode).toBe("diff");
  });

  it("--format agent: emits the deduped agent report (categories, occurrences)", async () => {
    const io = makeCapturingIo(
      result({ diagnostics: [diag(), diag({ line: 9 })] }),
    );
    await Effect.runPromise(runInspect(flags({ format: "agent" }), io, "0.0.0"));
    const parsed = JSON.parse(io.out.join(""));
    expect(parsed.ruleCount).toBe(1); // deduped by rule
    expect(parsed.occurrenceCount).toBe(2);
    expect(parsed.categories[0].category).toBe("type-safety");
    expect(parsed.score).toBe(100);
  });

  it("--explain <file:line>: offline rule text; never gates", async () => {
    const io = makeCapturingIo(result({ diagnostics: [diag()] }));
    const code = await Effect.runPromise(
      runInspect(
        flags({ explain: { file: "a.ts", line: 3 } }),
        io,
        "0.0.0",
      ),
    );
    const text = io.out.join("");
    expect(text).toContain("no-any");
    expect(text).toContain("Replace `any` with a precise type."); // from the catalog
    expect(code).toBe(0);
  });

  it("--explain with no diagnostic at the location: the 'No diagnostic' message", async () => {
    const io = makeCapturingIo(result({ diagnostics: [diag()] }));
    await Effect.runPromise(
      runInspect(flags({ explain: { file: "z.ts", line: 99 } }), io, "0.0.0"),
    );
    expect(io.out.join("")).toContain("No diagnostic at z.ts:99.");
  });
});

describe("exit codes (RULE-030) — via the proven exit-code slice", () => {
  it("clean run → 0", async () => {
    const io = makeCapturingIo(result({ diagnostics: [] }));
    expect(await Effect.runPromise(runInspect(flags(), io, "0.0.0"))).toBe(0);
  });

  it("error-severity + --fail-on error → 1", async () => {
    const io = makeCapturingIo(result({ diagnostics: [diag({ severity: "error" })] }));
    expect(
      await Effect.runPromise(runInspect(flags({ failOn: "error" }), io, "0.0.0")),
    ).toBe(1);
  });

  it("only warnings + --fail-on error → 0", async () => {
    const io = makeCapturingIo(result({ diagnostics: [diag({ severity: "warning" })] }));
    expect(
      await Effect.runPromise(runInspect(flags({ failOn: "error" }), io, "0.0.0")),
    ).toBe(0);
  });

  it("any diagnostic + --fail-on warning → 1", async () => {
    const io = makeCapturingIo(result({ diagnostics: [diag({ severity: "warning" })] }));
    expect(
      await Effect.runPromise(runInspect(flags({ failOn: "warning" }), io, "0.0.0")),
    ).toBe(1);
  });

  it("--fail-on none → 0 even with errors", async () => {
    const io = makeCapturingIo(result({ diagnostics: [diag({ severity: "error" })] }));
    expect(
      await Effect.runPromise(runInspect(flags({ failOn: "none" }), io, "0.0.0")),
    ).toBe(0);
  });

  it("--score mode → 0 regardless of findings", async () => {
    const io = makeCapturingIo(result({ diagnostics: [diag({ severity: "error" })] }));
    expect(
      await Effect.runPromise(
        runInspect(flags({ score: true, failOn: "error" }), io, "0.0.0"),
      ),
    ).toBe(0);
  });
});

describe("--fix wiring (delegates to the fix-applier slice)", () => {
  it("calls applyFixes with the diagnostics + project root, then prints a summary", async () => {
    const io = makeCapturingIo(
      result({ diagnostics: [diag()] }),
      { filesChanged: 1, appliedCount: 2, skippedCount: 1 },
    );
    await Effect.runPromise(runInspect(flags({ fix: true }), io, "0.0.0"));
    expect(io.fixCalls).toHaveLength(1);
    expect(io.fixCalls[0]?.rootDir).toBe("/proj"); // project.rootDirectory
    expect(io.err.join("")).toContain("Applied 2 fix(es) across 1 file(s)");
    expect(io.err.join("")).toContain("1 skipped (conflicts)");
  });

  it("does NOT call applyFixes without --fix", async () => {
    const io = makeCapturingIo(result({ diagnostics: [diag()] }));
    await Effect.runPromise(runInspect(flags(), io, "0.0.0"));
    expect(io.fixCalls).toHaveLength(0);
  });
});

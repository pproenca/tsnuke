/**
 * `renderProgressLine` — pure mapping from `ProgressEvent` to a stderr line.
 * Asserts the visible-text shape per event kind; ANSI is off so the lines are
 * snapshot-stable plain ASCII.
 */

import { describe, expect, it } from "vitest";
import type { ProgressEvent } from "@tsnuke/contracts-effect";
import { renderProgressLine } from "../main/renderProgress.js";

const noAnsi = { color: false } as const;

describe("renderProgressLine", () => {
  it("discovering project", () => {
    expect(
      renderProgressLine({ kind: "discovered", directory: "/p", elapsedMs: 8 }, noAnsi),
    ).toBe("  · discovering project… done (8ms)");
  });

  it("reading-files singular vs plural", () => {
    expect(
      renderProgressLine({ kind: "reading-files", count: 1, elapsedMs: 4 }, noAnsi),
    ).toBe("  · reading 1 file… done (4ms)");
    expect(
      renderProgressLine({ kind: "reading-files", count: 124, elapsedMs: 42 }, noAnsi),
    ).toBe("  · reading 124 files… done (42ms)");
  });

  it("building-program carries the typecheck outcome", () => {
    expect(
      renderProgressLine({ kind: "building-program", elapsedMs: 1200, typecheckOk: true }, noAnsi),
    ).toBe("  · building TS program… done (1.20s, typecheck=ok)");
    expect(
      renderProgressLine({ kind: "building-program", elapsedMs: 1500, typecheckOk: false }, noAnsi),
    ).toBe("  · building TS program… done (1.50s, typecheck=fail)");
  });

  it("tier-1 + tier-2 with counts", () => {
    expect(
      renderProgressLine({ kind: "tier-1", rules: 75, files: 124, elapsedMs: 400 }, noAnsi),
    ).toBe("  · tier-1: SYN+CFG ×75 over 124 files… done (400ms)");
    expect(
      renderProgressLine({ kind: "tier-2", rules: 18, files: 124, elapsedMs: 1800 }, noAnsi),
    ).toBe("  · tier-2: TYP ×18 over 124 files… done (1.80s)");
  });

  it("tier-2-skipped surfaces the reason", () => {
    expect(
      renderProgressLine({ kind: "tier-2-skipped", reason: "--no-deep" }, noAnsi),
    ).toBe("  · tier-2: skipped (--no-deep)");
  });

  it("graph", () => {
    expect(
      renderProgressLine({ kind: "graph", rules: 2, elapsedMs: 12 }, noAnsi),
    ).toBe("  · graph: 2 rules… done (12ms)");
  });

  it("scoring with score / n/a / partial", () => {
    expect(
      renderProgressLine({ kind: "scoring", score: 84, partial: false }, noAnsi),
    ).toBe("  · scoring → 84/100");
    expect(
      renderProgressLine({ kind: "scoring", score: 50, partial: true }, noAnsi),
    ).toBe("  · scoring → 50/100 (partial)");
    expect(
      renderProgressLine({ kind: "scoring", score: null, partial: false }, noAnsi),
    ).toBe("  · scoring → n/a");
  });

  it("project-start renders as a workspace header line (no bullet)", () => {
    expect(
      renderProgressLine(
        { kind: "project-start", index: 3, total: 12, directory: "packages/foo" },
        noAnsi,
      ),
    ).toBe("[3/12] packages/foo");
  });

  it("color: on wraps every event in ANSI dim escapes", () => {
    const e: ProgressEvent = { kind: "done", elapsedMs: 5 };
    const out = renderProgressLine(e, { color: true });
    expect(out).toContain("\x1b[2m");
    expect(out).toContain("\x1b[0m");
  });
});

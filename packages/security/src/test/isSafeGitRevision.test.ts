/**
 * Characterization tests for `isSafeGitRevision` — RULE-027 / BC-15.
 *
 * Guards a `--diff <base>` revision BEFORE it is handed to a git subprocess,
 * preventing argument injection (`--upload-pack=…`) and dangerous refspecs.
 * FROZEN verbatim from react-doctor. Returns `false` (never throws) when the
 * ref is unsafe; `true` otherwise. Each rejection branch is exercised below:
 *   - empty string
 *   - leading `-`            (would be parsed as a git flag)
 *   - leading OR trailing `.`
 *   - contains `..`          (range / parent traversal)
 *   - contains `@{`          (reflog selectors)
 *   - any char outside `[A-Za-z0-9_./-]`
 *
 * DORMANT (RULE-027): no git subprocess sink calls this yet — see
 * TRANSFORMATION_NOTES Follow-ups. The guard logic is correct regardless.
 */

import { describe, expect, it } from "vitest";
import { isSafeGitRevision } from "../main/index.js";

describe("isSafeGitRevision — BC-15 (accepts ordinary refs)", () => {
  it("accepts a plain branch name", () => {
    expect(isSafeGitRevision("main")).toBe(true);
  });
  it("accepts a remote-qualified branch", () => {
    expect(isSafeGitRevision("origin/main")).toBe(true);
  });
  it("accepts a slash-and-dot tag", () => {
    expect(isSafeGitRevision("release/1.2.3")).toBe(true);
  });
  it("accepts a short sha", () => {
    expect(isSafeGitRevision("a1b2c3d")).toBe(true);
  });
  it("accepts underscores and internal hyphens", () => {
    expect(isSafeGitRevision("feature_x-1")).toBe(true);
  });
  it("accepts an internal dot that is neither leading nor trailing", () => {
    expect(isSafeGitRevision("v1.0")).toBe(true);
  });
  it("accepts a single character ref", () => {
    expect(isSafeGitRevision("a")).toBe(true);
  });
});

describe("isSafeGitRevision — BC-15 (rejection branches, each in isolation)", () => {
  it("rejects the empty string", () => {
    expect(isSafeGitRevision("")).toBe(false);
  });

  it("rejects a leading `-` (git flag injection)", () => {
    expect(isSafeGitRevision("-main")).toBe(false);
  });

  it("rejects argument injection via a long flag", () => {
    expect(isSafeGitRevision("--upload-pack=x")).toBe(false);
  });

  it("rejects a leading `.`", () => {
    expect(isSafeGitRevision(".hidden")).toBe(false);
  });

  it("rejects a trailing `.`", () => {
    expect(isSafeGitRevision("trailing.")).toBe(false);
  });

  it("rejects a `..` range / parent traversal", () => {
    expect(isSafeGitRevision("a..b")).toBe(false);
  });

  it("rejects a `@{` reflog selector", () => {
    expect(isSafeGitRevision("HEAD@{1}")).toBe(false);
  });

  it("rejects an embedded space (outside the allowed charset)", () => {
    expect(isSafeGitRevision("a b")).toBe(false);
  });

  it("rejects a shell metachar sequence (outside the allowed charset)", () => {
    expect(isSafeGitRevision("a;rm -rf")).toBe(false);
  });

  it("rejects a tilde (outside the allowed charset)", () => {
    expect(isSafeGitRevision("HEAD~1")).toBe(false);
  });

  it("rejects a caret (outside the allowed charset)", () => {
    expect(isSafeGitRevision("HEAD^")).toBe(false);
  });
});

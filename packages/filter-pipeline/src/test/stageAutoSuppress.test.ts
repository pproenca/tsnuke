/**
 * Characterization tests for Stage 1 — auto-suppress (RULE-023 Stage 1).
 *
 * RULE-023 Stage 1: drop a diagnostic whose rule `tags` include `"test-noise"`.
 * The auto-suppress tag set is a FROZEN constant (`AUTO_SUPPRESS_TAGS`), not
 * config-driven (unlike `ignore.tags`). A diagnostic with no `tags` survives.
 */

import { describe, expect, it } from "vitest";
import { AUTO_SUPPRESS_TAGS, stageAutoSuppress } from "../main/index.js";
import { diag } from "./helpers.js";

describe("stageAutoSuppress — RULE-023 Stage 1 (frozen tag set)", () => {
  it("AUTO_SUPPRESS_TAGS contains exactly 'test-noise'", () => {
    expect(AUTO_SUPPRESS_TAGS.has("test-noise")).toBe(true);
    expect(AUTO_SUPPRESS_TAGS.size).toBe(1);
  });
});

describe("stageAutoSuppress — RULE-023 Stage 1 (drop test-noise)", () => {
  it("drops a diagnostic tagged 'test-noise'", () => {
    expect(stageAutoSuppress(diag({ rule: "noisy", tags: ["test-noise"] }))).toBeNull();
  });

  it("drops when 'test-noise' is one of several tags", () => {
    expect(
      stageAutoSuppress(diag({ rule: "noisy", tags: ["a", "test-noise", "b"] })),
    ).toBeNull();
  });

  it("keeps a diagnostic with no tags", () => {
    const d = diag({ rule: "kept" });
    expect(stageAutoSuppress(d)).toBe(d);
  });

  it("keeps a diagnostic with an empty tags array", () => {
    const d = diag({ rule: "kept", tags: [] });
    expect(stageAutoSuppress(d)).toBe(d);
  });

  it("keeps a diagnostic whose tags do not include 'test-noise'", () => {
    const d = diag({ rule: "kept", tags: ["slow", "flaky"] });
    expect(stageAutoSuppress(d)).toBe(d);
  });

  it("does not strip tags itself — only runFilterPipeline strips (returns the input ref)", () => {
    const d = diag({ rule: "kept", tags: ["slow"] });
    const out = stageAutoSuppress(d);
    expect(out).toBe(d);
    expect(out?.tags).toEqual(["slow"]);
  });
});

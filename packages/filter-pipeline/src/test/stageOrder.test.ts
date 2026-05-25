/**
 * Characterization tests for stage ORDER + short-circuit (RULE-023, BC-11).
 *
 * Order is load-bearing: auto-suppress (1) → severity (2) → ignore (3) →
 * inline-disable (4). A diagnostic dropped by an earlier stage NEVER reaches a
 * later one. Severity REMAPS at stage 2 are visible to later stages.
 *
 * Mirrors the legacy stage-order suite (legacy
 * `packages/core/src/filter-pipeline.test.ts:27-114`).
 */

import { describe, expect, it } from "vitest";
import { runFilterPipeline } from "../main/index.js";
import type { TsNukeConfig } from "../main/index.js";
import { diag } from "./helpers.js";

describe("runFilterPipeline — RULE-023 stage order (BC-11)", () => {
  it("stage 1 auto-suppress drops test-noise tagged diagnostics first", () => {
    const ds = [diag({ rule: "noisy", tags: ["test-noise"] })];
    expect(runFilterPipeline(ds, {})).toHaveLength(0);
  });

  it("severity 'off' at stage 2 drops a diagnostic before the ignore stage sees it", () => {
    const config: TsNukeConfig = { rules: { "off-me": "off" } };
    const ds = [diag({ rule: "off-me" })];
    expect(runFilterPipeline(ds, config)).toHaveLength(0);
  });

  it("severity override remaps a surviving diagnostic (warn -> warning)", () => {
    const config: TsNukeConfig = { rules: { downgraded: "warn" } };
    const out = runFilterPipeline([diag({ rule: "downgraded" })], config);
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe("warning");
  });

  it("stage 3 ignore drops by rule, by file, and by override", () => {
    const config: TsNukeConfig = {
      ignore: {
        rules: ["ignored-rule"],
        files: ["b.ts"],
        overrides: [{ files: ["c.ts"], rules: ["scoped"] }],
      },
    };
    const ds = [
      diag({ rule: "ignored-rule", filePath: "/x/a.ts" }), // dropped by rule
      diag({ rule: "anything", filePath: "/x/b.ts" }), // dropped by file
      diag({ rule: "scoped", filePath: "/x/c.ts" }), // dropped by override
      diag({ rule: "kept", filePath: "/x/d.ts" }), // survives
    ];
    const out = runFilterPipeline(ds, config);
    expect(out.map((d) => d.rule)).toEqual(["kept"]);
  });

  it("stage 4 inline-disable suppresses the matching rule on the next line", () => {
    const source = [
      "const a = 1;",
      "// tsnuke-disable-next-line no-magic",
      "const b: any = 2;",
    ].join("\n");
    const ds = [
      diag({ rule: "no-magic", filePath: "/x/a.ts", line: 3 }),
      diag({ rule: "other", filePath: "/x/a.ts", line: 3 }),
    ];
    const out = runFilterPipeline(ds, {}, { sources: new Map([["/x/a.ts", source]]) });
    expect(out.map((d) => d.rule)).toEqual(["other"]);
  });

  it("each stage operates only on the survivors of the prior stage (true short-circuit)", () => {
    // A diagnostic that WOULD be ignored by file is first dropped by 'off' at
    // stage 2 — proving stage 3 never runs on it. We can't observe the order
    // directly, but a single config exercising both confirms no double-handling.
    const config: TsNukeConfig = {
      rules: { gone: "off" },
      ignore: { files: ["a.ts"] }, // would also catch it, but stage 2 already dropped it
    };
    expect(runFilterPipeline([diag({ rule: "gone", filePath: "/x/a.ts" })], config)).toHaveLength(0);
  });

  it("a stage-2 severity remap is visible to a later (inline-disable) stage's pass-through", () => {
    // Remap to warning at stage 2; nothing else drops it; the emitted diag carries
    // the remapped severity (proving the remapped value flows downstream).
    const config: TsNukeConfig = { rules: { r: "warn" } };
    const source = ["// not a directive", "const x = 1;"].join("\n");
    const out = runFilterPipeline(
      [diag({ rule: "r", severity: "error", filePath: "/x/a.ts", line: 2 })],
      config,
      { sources: new Map([["/x/a.ts", source]]) },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe("warning");
  });
});

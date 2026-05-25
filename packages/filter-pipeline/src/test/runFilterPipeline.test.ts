/**
 * Characterization tests for the top-level `runFilterPipeline` (RULE-023, BC-11).
 *
 * Covers: gating (`respectInlineDisables` / `sources`), the engine-only `tags`
 * strip on emit, bare-vs-namespaced rule-id matching end to end, and the empty /
 * all-pass / all-drop boundaries.
 *
 * Mirrors / extends the legacy suite (legacy
 * `packages/core/src/filter-pipeline.test.ts`).
 */

import { describe, expect, it } from "vitest";
import { runFilterPipeline } from "../main/index.js";
import type { DiagnosticWithTags, TsDoctorConfig } from "../main/index.js";
import { diag } from "./helpers.js";

describe("runFilterPipeline — RULE-023 (inline-disable gating)", () => {
  const source = ["// ts-doctor-disable-next-line no-magic", "const b: any = 2;"].join("\n");

  it("respectInlineDisables:false skips the inline-disable stage entirely", () => {
    const ds = [diag({ rule: "no-magic", filePath: "/x/a.ts", line: 2 })];
    const out = runFilterPipeline(ds, {}, {
      respectInlineDisables: false,
      sources: new Map([["/x/a.ts", source]]),
    });
    expect(out).toHaveLength(1);
  });

  it("respectInlineDisables omitted (default true) runs the stage", () => {
    const ds = [diag({ rule: "no-magic", filePath: "/x/a.ts", line: 2 })];
    const out = runFilterPipeline(ds, {}, { sources: new Map([["/x/a.ts", source]]) });
    expect(out).toHaveLength(0);
  });

  it("inline-disable stage runs but is a no-op when no sources are supplied", () => {
    // respectInlineDisables defaults true, but with no sources the stage finds no
    // directives, so the diagnostic survives.
    const ds = [diag({ rule: "no-magic", filePath: "/x/a.ts", line: 2 })];
    expect(runFilterPipeline(ds, {})).toHaveLength(1);
  });

  it("respectInlineDisables:true with no sources is also a no-op (survives)", () => {
    const ds = [diag({ rule: "no-magic", filePath: "/x/a.ts", line: 2 })];
    expect(runFilterPipeline(ds, {}, { respectInlineDisables: true })).toHaveLength(1);
  });
});

describe("runFilterPipeline — RULE-023 (tags stripping)", () => {
  it("strips the engine-only tags field from emitted diagnostics", () => {
    const out = runFilterPipeline([diag({ rule: "kept", tags: ["a"] })], {});
    expect(out).toHaveLength(1);
    expect((out[0] as DiagnosticWithTags).tags).toBeUndefined();
    expect("tags" in out[0]!).toBe(false);
  });

  it("emits a public Diagnostic with all non-tags fields preserved", () => {
    const input = diag({ rule: "kept", tags: ["x"], filePath: "/p/q.ts", line: 9, column: 4 });
    const out = runFilterPipeline([input], {});
    const { tags: _t, ...expected } = input;
    void _t;
    expect(out[0]).toEqual(expected);
  });

  it("keeps a diagnostic that had no tags unchanged in shape", () => {
    const input = diag({ rule: "kept" });
    const out = runFilterPipeline([input], {});
    expect(out[0]).toEqual(input);
  });
});

describe("runFilterPipeline — RULE-023 (bare vs namespaced rule-id matching)", () => {
  it("severity 'off' matches via bare id", () => {
    const config: TsDoctorConfig = { rules: { bare: "off" } };
    expect(runFilterPipeline([diag({ plugin: "ts-doctor", rule: "bare" })], config)).toHaveLength(0);
  });
  it("severity 'off' matches via plugin/rule id", () => {
    const config: TsDoctorConfig = { rules: { "ts-doctor/ns": "off" } };
    expect(runFilterPipeline([diag({ plugin: "ts-doctor", rule: "ns" })], config)).toHaveLength(0);
  });
  it("ignore.rules matches via plugin/rule id", () => {
    const config: TsDoctorConfig = { ignore: { rules: ["ts-doctor/ig"] } };
    expect(runFilterPipeline([diag({ plugin: "ts-doctor", rule: "ig" })], config)).toHaveLength(0);
  });
});

describe("runFilterPipeline — RULE-023 (boundaries)", () => {
  it("empty diagnostics -> empty output", () => {
    expect(runFilterPipeline([], {})).toEqual([]);
  });

  it("empty config + no options -> identity (all survive, tags stripped)", () => {
    const ds = [diag({ rule: "a" }), diag({ rule: "b" })];
    const out = runFilterPipeline(ds, {});
    expect(out.map((d) => d.rule)).toEqual(["a", "b"]);
  });

  it("preserves input order among survivors", () => {
    const config: TsDoctorConfig = { rules: { drop: "off" } };
    const ds = [
      diag({ rule: "a" }),
      diag({ rule: "drop" }),
      diag({ rule: "b" }),
      diag({ rule: "c" }),
    ];
    expect(runFilterPipeline(ds, config).map((d) => d.rule)).toEqual(["a", "b", "c"]);
  });
});

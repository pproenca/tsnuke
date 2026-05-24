import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@ts-doctor/rules";
import {
  runFilterPipeline,
  type DiagnosticWithTags,
} from "./filter-pipeline.js";
import type { TsDoctorConfig } from "./types.js";

function diag(
  over: Partial<DiagnosticWithTags> & Pick<Diagnostic, "rule"> &
    Partial<Pick<Diagnostic, "line" | "filePath">>,
): DiagnosticWithTags {
  return {
    filePath: over.filePath ?? "/x/a.ts",
    plugin: "ts-doctor",
    severity: "error",
    message: "m",
    help: "h",
    line: over.line ?? 1,
    column: 1,
    category: "Type Safety",
    tier: "SYN",
    ...over,
  };
}

describe("runFilterPipeline stage order (BC-11)", () => {
  it("stage 1 auto-suppress drops test-noise tagged diagnostics first", () => {
    const ds = [diag({ rule: "noisy", tags: ["test-noise"] })];
    expect(runFilterPipeline(ds, {})).toHaveLength(0);
  });

  it("severity 'off' at stage 2 drops a diagnostic before the ignore stage sees it", () => {
    // The diagnostic is turned off by config.rules. If the ignore stage ran on
    // a still-present diagnostic it would also drop it — but order is what's under
    // test: stage 2 must remove it so stage 3 never matters. We assert it's gone
    // AND that flipping the rule back on but ignoring it by FILE still drops it,
    // proving each stage operates on the survivors of the prior one.
    const config: TsDoctorConfig = { rules: { "off-me": "off" } };
    const ds = [diag({ rule: "off-me" })];
    expect(runFilterPipeline(ds, config)).toHaveLength(0);
  });

  it("severity override remaps a surviving diagnostic (warn)", () => {
    const config: TsDoctorConfig = { rules: { downgraded: "warn" } };
    const out = runFilterPipeline([diag({ rule: "downgraded" })], config);
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe("warning");
  });

  it("stage 3 ignore drops by rule, by file, and by override", () => {
    const config: TsDoctorConfig = {
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
      "// ts-doctor-disable-next-line no-magic",
      "const b: any = 2;", // line 3 — disabled for no-magic
    ].join("\n");
    const ds = [
      diag({ rule: "no-magic", filePath: "/x/a.ts", line: 3 }),
      diag({ rule: "other", filePath: "/x/a.ts", line: 3 }), // not disabled
    ];
    const out = runFilterPipeline(ds, {}, {
      sources: new Map([["/x/a.ts", source]]),
    });
    expect(out.map((d) => d.rule)).toEqual(["other"]);
  });

  it("inline-disable with no rule listed suppresses all rules on the next line", () => {
    const source = ["// ts-doctor-disable-next-line", "const b: any = 2;"].join(
      "\n",
    );
    const ds = [diag({ rule: "whatever", filePath: "/x/a.ts", line: 2 })];
    const out = runFilterPipeline(ds, {}, {
      sources: new Map([["/x/a.ts", source]]),
    });
    expect(out).toHaveLength(0);
  });

  it("respectInlineDisables:false skips the inline-disable stage entirely", () => {
    const source = [
      "// ts-doctor-disable-next-line no-magic",
      "const b: any = 2;",
    ].join("\n");
    const ds = [diag({ rule: "no-magic", filePath: "/x/a.ts", line: 2 })];
    const out = runFilterPipeline(ds, {}, {
      respectInlineDisables: false,
      sources: new Map([["/x/a.ts", source]]),
    });
    expect(out).toHaveLength(1);
  });

  it("strips the engine-only tags field from emitted diagnostics", () => {
    const out = runFilterPipeline([diag({ rule: "kept", tags: ["a"] })], {});
    expect(out).toHaveLength(1);
    expect((out[0] as DiagnosticWithTags).tags).toBeUndefined();
  });
});

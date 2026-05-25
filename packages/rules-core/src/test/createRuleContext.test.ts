/**
 * Characterization — `createRuleContext.report` auto-fill (the substrate's core
 * behavior). Drives `report` with a FAKE sink and a placeholder sourceFile: the
 * auto-fill logic is independent of the parsed AST, so no real parse is needed.
 *
 * Pins (legacy `define-rule.ts:54-93`):
 *   - `plugin` is FORCED to "ts-fix" (BC-18) — not present in ReportInput.
 *   - `rule`/`tier`/`category`/`severity` DEFAULT from meta, each OVERRIDABLE.
 *   - required passthrough: filePath/message/help/line/column.
 *   - `url`/`fix`/`suppressionHint` only set WHEN PRESENT (exactOptional spread):
 *     an absent optional is ABSENT on the output, not `key: undefined`.
 */

import { describe, expect, it } from "vitest";
import type ts from "typescript";
import type { Diagnostic, RuleMeta } from "@ts-fix/contracts-effect";
import { createRuleContext } from "../main/index.js";
import type { ReportInput } from "../main/index.js";

// The substrate's `report` never reads the sourceFile; a placeholder is enough to
// satisfy the type. (No AST needed — the auto-fill is pure record-building.)
const FAKE_SOURCE_FILE = { kind: 0 } as unknown as ts.SourceFile;

const META: RuleMeta = {
  id: "no-explicit-any",
  severity: "warning",
  category: "Type Safety",
  tier: "SYN",
};

function capture(input: ReportInput, meta: RuleMeta = META): Diagnostic {
  const out: Diagnostic[] = [];
  const ctx = createRuleContext(meta, {
    sourceFile: FAKE_SOURCE_FILE,
    filePath: "src/foo.ts",
    sink: (d) => out.push(d),
  });
  ctx.report(input);
  expect(out).toHaveLength(1);
  return out[0]!;
}

const MINIMAL: ReportInput = {
  filePath: "src/foo.ts",
  message: "m",
  help: "h",
  line: 12,
  column: 4,
};

describe("createRuleContext.report — plugin (BC-18)", () => {
  it("forces plugin to 'ts-fix'", () => {
    expect(capture(MINIMAL).plugin).toBe("ts-fix");
  });
});

describe("createRuleContext.report — meta-derived defaults", () => {
  it("defaults rule/tier/category/severity from meta", () => {
    const d = capture(MINIMAL);
    expect(d.rule).toBe("no-explicit-any");
    expect(d.tier).toBe("SYN");
    expect(d.category).toBe("Type Safety");
    expect(d.severity).toBe("warning");
  });

  it("overrides rule when supplied", () => {
    expect(capture({ ...MINIMAL, rule: "custom" }).rule).toBe("custom");
  });

  it("overrides tier when supplied", () => {
    expect(capture({ ...MINIMAL, tier: "TYP" }).tier).toBe("TYP");
  });

  it("overrides category when supplied", () => {
    expect(capture({ ...MINIMAL, category: "Other" }).category).toBe("Other");
  });

  it("overrides severity when supplied (e.g. downgrade)", () => {
    expect(capture({ ...MINIMAL, severity: "error" }).severity).toBe("error");
  });
});

describe("createRuleContext.report — required passthrough", () => {
  it("carries filePath/message/help/line/column verbatim", () => {
    const d = capture({
      filePath: "src/bar.ts",
      message: "the message",
      help: "the help",
      line: 7,
      column: 3,
    });
    expect(d.filePath).toBe("src/bar.ts");
    expect(d.message).toBe("the message");
    expect(d.help).toBe("the help");
    expect(d.line).toBe(7);
    expect(d.column).toBe(3);
  });
});

describe("createRuleContext.report — optional fields (exactOptionalPropertyTypes spread)", () => {
  it("OMITS url/fix/suppressionHint when absent (key not present, not undefined)", () => {
    const d = capture(MINIMAL);
    expect(d).not.toHaveProperty("url");
    expect(d).not.toHaveProperty("fix");
    expect(d).not.toHaveProperty("suppressionHint");
  });

  it("sets url when present", () => {
    const d = capture({ ...MINIMAL, url: "https://x" });
    expect(d.url).toBe("https://x");
    expect(d).not.toHaveProperty("fix");
  });

  it("sets fix when present", () => {
    const fix = { kind: "manual" as const, edits: [] };
    const d = capture({ ...MINIMAL, fix });
    expect(d.fix).toStrictEqual(fix);
    expect(d).not.toHaveProperty("url");
  });

  it("sets suppressionHint when present", () => {
    const d = capture({ ...MINIMAL, suppressionHint: "near-miss" });
    expect(d.suppressionHint).toBe("near-miss");
  });

  it("sets all three optionals together when all present", () => {
    const fix = { kind: "auto-fix" as const, edits: [{ start: 0, end: 1, replacement: "" }] };
    const d = capture({ ...MINIMAL, url: "https://x", fix, suppressionHint: "h" });
    expect(d.url).toBe("https://x");
    expect(d.fix).toStrictEqual(fix);
    expect(d.suppressionHint).toBe("h");
  });
});

describe("createRuleContext — checker passthrough (exactOptional)", () => {
  it("omits checker when not supplied (not present, not undefined)", () => {
    const ctx = createRuleContext(META, {
      sourceFile: FAKE_SOURCE_FILE,
      filePath: "src/foo.ts",
      sink: () => {},
    });
    expect(ctx).not.toHaveProperty("checker");
    expect(ctx.sourceFile).toBe(FAKE_SOURCE_FILE);
    expect(ctx.filePath).toBe("src/foo.ts");
  });

  it("sets checker when supplied (TYP path)", () => {
    const fakeChecker = {} as ts.TypeChecker;
    const ctx = createRuleContext(META, {
      sourceFile: FAKE_SOURCE_FILE,
      filePath: "src/foo.ts",
      checker: fakeChecker,
      sink: () => {},
    });
    expect(ctx.checker).toBe(fakeChecker);
  });
});

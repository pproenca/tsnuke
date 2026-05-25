/**
 * Characterization tests for Stage 4 — inline-disable (RULE-023 Stage 4, BC-11/BC-12).
 *
 * RULE-023 Stage 4: `// ts-doctor-disable-next-line [rules]` disables the NEXT
 * line (target = directive line + 2, 1-based). No rules listed ⇒ all rules; rule
 * list is split on `[\s,]+`. A diagnostic with `line <= 0` is exempt. Rule matching
 * accepts bare and `plugin/rule`.
 *
 * `parseInlineDisables(text)` is tested directly for the parsing edge cases.
 */

import { describe, expect, it } from "vitest";
import { makeInlineDisableStage, parseInlineDisables } from "../main/index.js";
import { diag } from "./helpers.js";

describe("parseInlineDisables — RULE-023 Stage 4 (next-line targeting)", () => {
  it("targets directive line + 2 (1-based next line)", () => {
    const text = ["const a = 1;", "// ts-doctor-disable-next-line no-magic", "x"].join("\n");
    // directive on 0-based index 1 -> target 1-based line 3
    const map = parseInlineDisables(text);
    expect(map.has(3)).toBe(true);
    expect(map.has(2)).toBe(false);
  });

  it("a directive on the first line targets line 2", () => {
    const text = ["// ts-doctor-disable-next-line foo", "y"].join("\n");
    const map = parseInlineDisables(text);
    expect(map.has(2)).toBe(true);
  });
});

describe("parseInlineDisables — RULE-023 Stage 4 (no rules listed = all)", () => {
  it("no rules -> { all: true, empty rules }", () => {
    const text = ["// ts-doctor-disable-next-line", "y"].join("\n");
    const entry = parseInlineDisables(text).get(2);
    expect(entry?.all).toBe(true);
    expect(entry?.rules.size).toBe(0);
  });

  it("trailing whitespace after the directive is still 'all'", () => {
    const text = ["// ts-doctor-disable-next-line   ", "y"].join("\n");
    const entry = parseInlineDisables(text).get(2);
    expect(entry?.all).toBe(true);
  });
});

describe("parseInlineDisables — RULE-023 Stage 4 (rule list splitting [\\s,]+)", () => {
  it("space-separated rule list", () => {
    const text = ["// ts-doctor-disable-next-line a b c", "y"].join("\n");
    const entry = parseInlineDisables(text).get(2);
    expect(entry?.all).toBe(false);
    expect([...entry!.rules].sort()).toEqual(["a", "b", "c"]);
  });

  it("comma-separated rule list", () => {
    const text = ["// ts-doctor-disable-next-line a,b,c", "y"].join("\n");
    const entry = parseInlineDisables(text).get(2);
    expect([...entry!.rules].sort()).toEqual(["a", "b", "c"]);
  });

  it("mixed comma + space list", () => {
    const text = ["// ts-doctor-disable-next-line a, b ,  c", "y"].join("\n");
    const entry = parseInlineDisables(text).get(2);
    expect([...entry!.rules].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("parseInlineDisables — RULE-023 Stage 4 (line-ending + comment styles)", () => {
  it("handles CRLF and CR line endings", () => {
    const text = "// ts-doctor-disable-next-line r\r\nconst b = 2;\rconst c = 3;";
    const map = parseInlineDisables(text);
    expect(map.has(2)).toBe(true);
  });

  it("matches with extra spaces after //", () => {
    const text = ["//   ts-doctor-disable-next-line r", "y"].join("\n");
    expect(parseInlineDisables(text).has(2)).toBe(true);
  });

  it("ignores non-directive comments", () => {
    const text = ["// just a comment", "y"].join("\n");
    expect(parseInlineDisables(text).size).toBe(0);
  });
});

describe("makeInlineDisableStage — RULE-023 Stage 4 (suppression)", () => {
  const source = [
    "const a = 1;",
    "// ts-doctor-disable-next-line no-magic",
    "const b: any = 2;", // line 3
  ].join("\n");
  const sources = new Map([["/x/a.ts", source]]);

  it("suppresses the matching rule on the targeted next line", () => {
    const stage = makeInlineDisableStage(sources);
    expect(stage(diag({ rule: "no-magic", filePath: "/x/a.ts", line: 3 }))).toBeNull();
  });

  it("does not suppress a non-listed rule on that line", () => {
    const stage = makeInlineDisableStage(sources);
    const d = diag({ rule: "other", filePath: "/x/a.ts", line: 3 });
    expect(stage(d)).toBe(d);
  });

  it("suppresses by namespaced plugin/rule id", () => {
    const ns = new Map([
      ["/x/a.ts", "// ts-doctor-disable-next-line ts-doctor/no-magic\nconst b = 2;"],
    ]);
    const stage = makeInlineDisableStage(ns);
    expect(
      stage(diag({ plugin: "ts-doctor", rule: "no-magic", filePath: "/x/a.ts", line: 2 })),
    ).toBeNull();
  });

  it("no-rules directive suppresses ALL rules on the next line", () => {
    const allSrc = new Map([
      ["/x/a.ts", ["// ts-doctor-disable-next-line", "const b: any = 2;"].join("\n")],
    ]);
    const stage = makeInlineDisableStage(allSrc);
    expect(stage(diag({ rule: "whatever", filePath: "/x/a.ts", line: 2 }))).toBeNull();
  });
});

describe("makeInlineDisableStage — RULE-023 Stage 4 (exemptions / no-op)", () => {
  it("line <= 0 is exempt from inline-disable (BC-12)", () => {
    const sources = new Map([
      ["/x/a.ts", ["// ts-doctor-disable-next-line", "x"].join("\n")],
    ]);
    const stage = makeInlineDisableStage(sources);
    const d0 = diag({ rule: "r", filePath: "/x/a.ts", line: 0 });
    const dNeg = diag({ rule: "r", filePath: "/x/a.ts", line: -5 });
    expect(stage(d0)).toBe(d0);
    expect(stage(dNeg)).toBe(dNeg);
  });

  it("a line with no directive is kept", () => {
    const sources = new Map([
      ["/x/a.ts", ["// ts-doctor-disable-next-line r", "x", "y"].join("\n")],
    ]);
    const stage = makeInlineDisableStage(sources);
    const d = diag({ rule: "r", filePath: "/x/a.ts", line: 3 }); // directive targets line 2, not 3
    expect(stage(d)).toBe(d);
  });

  it("a file with no source text is a no-op (diagnostic kept)", () => {
    const stage = makeInlineDisableStage(new Map());
    const d = diag({ rule: "r", filePath: "/x/missing.ts", line: 2 });
    expect(stage(d)).toBe(d);
  });

  it("undefined sources map is a no-op (diagnostic kept)", () => {
    const stage = makeInlineDisableStage(undefined);
    const d = diag({ rule: "r", filePath: "/x/a.ts", line: 2 });
    expect(stage(d)).toBe(d);
  });
});

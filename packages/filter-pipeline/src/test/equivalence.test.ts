/**
 * THE EQUIVALENCE PROOF — differential test, modern vs legacy oracle (RULE-023).
 *
 * Goal: prove the Effect-TS `runFilterPipeline` is STRUCTURALLY identical to the
 * legacy algorithm over a broad set of crafted fixtures. Unlike the `score` slice,
 * this transform has NO intended behavioral deviation — the only change is the
 * single-vocabulary consolidation (RULE-040 / deviation D1), which must NOT change
 * outputs. So we assert 100% equality (`modern === legacy`, deep).
 *
 * Strategy:
 *   1. VENDORED, FROZEN, ATTRIBUTED copy of the legacy algorithm as an oracle
 *      (below) — copied verbatim from
 *      legacy/ts-fix/packages/core/src/filter-pipeline.ts (218 lines), with the
 *      legacy two-place `warn`→`warning` normalization preserved AS-IS. Do NOT
 *      "fix" or refactor it — its job is to be the ground truth we diverge from
 *      structurally (single vocab) but match behaviorally.
 *   2. A matrix of crafted fixtures (diagnostics + config + options) exercising
 *      every stage, both rule-id forms, all three file-match modes, overrides with
 *      and without rules, inline-disable parsing edge cases, the tags strip, and
 *      the respectInlineDisables/sources gating.
 *   3. For each fixture: assert deepEqual(modern, legacy). A guard asserts the
 *      fixture set actually exercises drops (so an all-pass wouldn't prove nothing).
 */

import { describe, expect, it } from "vitest";
import { runFilterPipeline as modernRun } from "../main/index.js";
import type { DiagnosticWithTags, TsFixConfig } from "../main/index.js";

// ===========================================================================
// ORACLE — frozen verbatim copy of
// legacy/ts-fix/packages/core/src/filter-pipeline.ts (READ-ONLY source).
// Attribution: ts-fix @ts-fix/core, src/filter-pipeline.ts. The legacy
// `warn`↔`warning` normalization (normalizeSeverity) is preserved here exactly;
// the modern slice consolidates it (D1) but must produce identical output.
// For differential testing ONLY — do not refactor.
// ===========================================================================

type LegacySeverity = "error" | "warning";

interface LegacyDiagnostic {
  filePath: string;
  plugin: string;
  rule: string;
  severity: LegacySeverity;
  message: string;
  help: string;
  url?: string;
  line: number;
  column: number;
  category: string;
  tier: "SYN" | "TYP" | "GRAPH" | "CFG";
  fix?: unknown;
  suppressionHint?: string;
}

interface LegacyDiagnosticWithTags extends LegacyDiagnostic {
  tags?: readonly string[];
}

interface LegacyTsFixConfig {
  ignore?: {
    rules?: string[];
    files?: string[];
    tags?: string[];
    overrides?: { files: string[]; rules?: string[] }[];
  };
  rules?: Record<string, "error" | "warn" | "off">;
  categories?: Record<string, "error" | "warn" | "off">;
}

interface LegacyFilterPipelineOptions {
  respectInlineDisables?: boolean;
  sources?: ReadonlyMap<string, string>;
}

type LegacyStage = (d: LegacyDiagnosticWithTags) => LegacyDiagnosticWithTags | null;

const LEGACY_AUTO_SUPPRESS_TAGS: ReadonlySet<string> = new Set(["test-noise"]);

function legacyNormalizeSeverity(
  value: "error" | "warn" | "off",
): LegacySeverity | "off" {
  if (value === "off") return "off";
  return value === "warn" ? "warning" : "error";
}

function legacyStageAutoSuppress(
  d: LegacyDiagnosticWithTags,
): LegacyDiagnosticWithTags | null {
  if (d.tags) {
    for (const tag of d.tags) {
      if (LEGACY_AUTO_SUPPRESS_TAGS.has(tag)) return null;
    }
  }
  return d;
}

function legacyMakeSeverityStage(config: LegacyTsFixConfig): LegacyStage {
  const ruleOverrides = config.rules ?? {};
  const categoryOverrides = config.categories ?? {};
  return (d) => {
    const ruleOv = ruleOverrides[d.rule] ?? ruleOverrides[`${d.plugin}/${d.rule}`];
    if (ruleOv !== undefined) {
      const sev = legacyNormalizeSeverity(ruleOv);
      if (sev === "off") return null;
      return { ...d, severity: sev };
    }
    const catOv = categoryOverrides[d.category];
    if (catOv !== undefined) {
      const sev = legacyNormalizeSeverity(catOv);
      if (sev === "off") return null;
      return { ...d, severity: sev };
    }
    return d;
  };
}

function legacyFileMatches(filePath: string, pattern: string): boolean {
  if (filePath === pattern) return true;
  if (filePath.endsWith(pattern)) return true;
  if (filePath.includes(pattern)) return true;
  return false;
}

function legacyMakeIgnoreStage(config: LegacyTsFixConfig): LegacyStage {
  const ignore = config.ignore ?? {};
  const ignoredRules = new Set(ignore.rules ?? []);
  const ignoredFiles = ignore.files ?? [];
  const overrides = ignore.overrides ?? [];
  return (d) => {
    if (ignoredRules.has(d.rule) || ignoredRules.has(`${d.plugin}/${d.rule}`)) {
      return null;
    }
    for (const f of ignoredFiles) {
      if (legacyFileMatches(d.filePath, f)) return null;
    }
    for (const ov of overrides) {
      const fileHit = ov.files.some((f) => legacyFileMatches(d.filePath, f));
      if (!fileHit) continue;
      if (ov.rules === undefined) return null;
      if (ov.rules.includes(d.rule) || ov.rules.includes(`${d.plugin}/${d.rule}`)) {
        return null;
      }
    }
    return d;
  };
}

const LEGACY_DISABLE_NEXT_LINE_RE = /\/\/\s*ts-fix-disable-next-line\s*(.*)$/;

function legacyParseInlineDisables(
  text: string,
): Map<number, { all: boolean; rules: Set<string> }> {
  const out = new Map<number, { all: boolean; rules: Set<string> }>();
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const m = line.match(LEGACY_DISABLE_NEXT_LINE_RE);
    if (!m) continue;
    const targetLine = i + 2;
    const rest = (m[1] ?? "").trim();
    const ruleNames = rest.length > 0 ? rest.split(/[\s,]+/).filter(Boolean) : [];
    out.set(targetLine, { all: ruleNames.length === 0, rules: new Set(ruleNames) });
  }
  return out;
}

function legacyMakeInlineDisableStage(
  sources: ReadonlyMap<string, string> | undefined,
): LegacyStage {
  const cache = new Map<string, Map<number, { all: boolean; rules: Set<string> }>>();
  const directivesFor = (filePath: string) => {
    const cached = cache.get(filePath);
    if (cached !== undefined) return cached;
    const text = sources?.get(filePath);
    const parsed =
      text !== undefined
        ? legacyParseInlineDisables(text)
        : new Map<number, { all: boolean; rules: Set<string> }>();
    cache.set(filePath, parsed);
    return parsed;
  };
  return (d) => {
    if (d.line <= 0) return d;
    const directive = directivesFor(d.filePath).get(d.line);
    if (directive === undefined) return d;
    if (directive.all) return null;
    if (directive.rules.has(d.rule) || directive.rules.has(`${d.plugin}/${d.rule}`)) {
      return null;
    }
    return d;
  };
}

function legacyRunFilterPipeline(
  diagnostics: readonly LegacyDiagnosticWithTags[],
  config: LegacyTsFixConfig,
  options: LegacyFilterPipelineOptions = {},
): LegacyDiagnostic[] {
  const respectInline = options.respectInlineDisables !== false;
  const stages: LegacyStage[] = [
    legacyStageAutoSuppress,
    legacyMakeSeverityStage(config),
    legacyMakeIgnoreStage(config),
  ];
  if (respectInline) {
    stages.push(legacyMakeInlineDisableStage(options.sources));
  }
  const out: LegacyDiagnostic[] = [];
  outer: for (const d of diagnostics) {
    let current: LegacyDiagnosticWithTags | null = d;
    for (const stage of stages) {
      current = stage(current);
      if (current === null) continue outer;
    }
    const { tags: _tags, ...rest } = current;
    void _tags;
    out.push(rest);
  }
  return out;
}

// ===========================================================================
// FIXTURES — crafted to exercise every stage and edge case. Each is a tuple of
// [name, diagnostics, config, options]. Built with a `diag` shim that produces
// BOTH a modern DiagnosticWithTags and an identical legacy one (same object
// shape, so we feed the same literals to both pipelines).
// ===========================================================================

function diag(
  over: Partial<DiagnosticWithTags> & Pick<DiagnosticWithTags, "rule">,
): DiagnosticWithTags {
  return {
    filePath: over.filePath ?? "/x/a.ts",
    plugin: "ts-fix",
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

interface Fixture {
  name: string;
  diagnostics: DiagnosticWithTags[];
  config: TsFixConfig;
  options?: { respectInlineDisables?: boolean; sources?: Map<string, string> };
}

const SRC_DISABLE_RULE = new Map([
  [
    "/x/a.ts",
    ["const a = 1;", "// ts-fix-disable-next-line no-magic", "const b: any = 2;"].join("\n"),
  ],
]);
const SRC_DISABLE_ALL = new Map([
  ["/x/a.ts", ["// ts-fix-disable-next-line", "const b: any = 2;"].join("\n")],
]);
const SRC_DISABLE_NS = new Map([
  ["/x/a.ts", ["// ts-fix-disable-next-line ts-fix/no-magic", "const b = 2;"].join("\n")],
]);
const SRC_DISABLE_LIST = new Map([
  ["/x/a.ts", ["// ts-fix-disable-next-line  a, b ,c", "const b = 2;"].join("\n")],
]);
const SRC_CRLF = new Map([
  ["/x/a.ts", "// ts-fix-disable-next-line r\r\nconst b = 2;\rconst c = 3;"],
]);

const fixtures: Fixture[] = [
  { name: "empty diagnostics", diagnostics: [], config: {} },
  { name: "empty config identity", diagnostics: [diag({ rule: "a" }), diag({ rule: "b" })], config: {} },

  // Stage 1
  { name: "auto-suppress test-noise", diagnostics: [diag({ rule: "n", tags: ["test-noise"] })], config: {} },
  { name: "auto-suppress mixed tags", diagnostics: [diag({ rule: "n", tags: ["x", "test-noise"] }), diag({ rule: "k", tags: ["x"] })], config: {} },
  { name: "tags stripped on survive", diagnostics: [diag({ rule: "k", tags: ["x"] })], config: {} },

  // Stage 2 — rules
  { name: "rules off bare", diagnostics: [diag({ rule: "off-me" })], config: { rules: { "off-me": "off" } } },
  { name: "rules off ns", diagnostics: [diag({ rule: "off-me" })], config: { rules: { "ts-fix/off-me": "off" } } },
  { name: "rules warn->warning", diagnostics: [diag({ rule: "r", severity: "error" })], config: { rules: { r: "warn" } } },
  { name: "rules error upgrade", diagnostics: [diag({ rule: "r", severity: "warning" })], config: { rules: { r: "error" } } },
  // Stage 2 — bare-vs-namespaced key COLLISION (pins the `??` precedence at
  // stages.ts:68 — bare `rule` wins over `plugin/rule`). If those `??` operands
  // were ever swapped, BOTH fixtures diverge from the oracle: a score-moving
  // regression (filter-pipeline is the last gate before scoring). Architecture review.
  { name: "rules collision: bare warn beats ns off", diagnostics: [diag({ plugin: "ts-fix", rule: "r", severity: "error" })], config: { rules: { r: "warn", "ts-fix/r": "off" } } },
  { name: "rules collision: bare off beats ns warn", diagnostics: [diag({ plugin: "ts-fix", rule: "r", severity: "error" })], config: { rules: { r: "off", "ts-fix/r": "warn" } } },
  // Stage 2 — categories + precedence
  { name: "categories off", diagnostics: [diag({ rule: "r", category: "Type Safety" })], config: { categories: { "Type Safety": "off" } } },
  { name: "categories warn", diagnostics: [diag({ rule: "r", category: "Type Safety", severity: "error" })], config: { categories: { "Type Safety": "warn" } } },
  { name: "rules beats categories", diagnostics: [diag({ rule: "r", category: "Type Safety", severity: "error" })], config: { rules: { r: "warn" }, categories: { "Type Safety": "off" } } },
  { name: "category fallback when rule absent", diagnostics: [diag({ rule: "r", category: "Type Safety", severity: "error" })], config: { rules: { other: "off" }, categories: { "Type Safety": "warn" } } },

  // Stage 3 — ignore.rules
  { name: "ignore rule bare", diagnostics: [diag({ rule: "ig" })], config: { ignore: { rules: ["ig"] } } },
  { name: "ignore rule ns", diagnostics: [diag({ rule: "ig" })], config: { ignore: { rules: ["ts-fix/ig"] } } },
  { name: "ignore rules collision: both forms present still drops", diagnostics: [diag({ plugin: "ts-fix", rule: "ig" })], config: { ignore: { rules: ["ig", "ts-fix/ig"] } } },
  // Stage 3 — ignore.files (exact / suffix / substring)
  { name: "ignore file exact", diagnostics: [diag({ rule: "r", filePath: "/x/a.ts" })], config: { ignore: { files: ["/x/a.ts"] } } },
  { name: "ignore file suffix", diagnostics: [diag({ rule: "r", filePath: "/deep/a.ts" })], config: { ignore: { files: ["a.ts"] } } },
  { name: "ignore file substring", diagnostics: [diag({ rule: "r", filePath: "/x/generated/a.ts" })], config: { ignore: { files: ["generated"] } } },
  { name: "ignore file no match survives", diagnostics: [diag({ rule: "r", filePath: "/x/a.ts" })], config: { ignore: { files: ["b.ts"] } } },
  // Stage 3 — overrides
  { name: "override no rules drops all", diagnostics: [diag({ rule: "x", filePath: "/x/c.ts" }), diag({ rule: "y", filePath: "/x/c.ts" })], config: { ignore: { overrides: [{ files: ["c.ts"] }] } } },
  { name: "override with rules scoped", diagnostics: [diag({ rule: "scoped", filePath: "/x/c.ts" }), diag({ rule: "other", filePath: "/x/c.ts" })], config: { ignore: { overrides: [{ files: ["c.ts"], rules: ["scoped"] }] } } },
  { name: "override with rules ns", diagnostics: [diag({ rule: "scoped", filePath: "/x/c.ts" })], config: { ignore: { overrides: [{ files: ["c.ts"], rules: ["ts-fix/scoped"] }] } } },
  { name: "override rules collision: both forms present still drops", diagnostics: [diag({ plugin: "ts-fix", rule: "scoped", filePath: "/x/c.ts" })], config: { ignore: { overrides: [{ files: ["c.ts"], rules: ["scoped", "ts-fix/scoped"] }] } } },
  { name: "override non-matching file survives", diagnostics: [diag({ rule: "scoped", filePath: "/x/d.ts" })], config: { ignore: { overrides: [{ files: ["c.ts"], rules: ["scoped"] }] } } },

  // Stage 4 — inline-disable
  { name: "inline disable rule", diagnostics: [diag({ rule: "no-magic", filePath: "/x/a.ts", line: 3 }), diag({ rule: "other", filePath: "/x/a.ts", line: 3 })], config: {}, options: { sources: SRC_DISABLE_RULE } },
  { name: "inline disable all", diagnostics: [diag({ rule: "whatever", filePath: "/x/a.ts", line: 2 })], config: {}, options: { sources: SRC_DISABLE_ALL } },
  { name: "inline disable ns", diagnostics: [diag({ plugin: "ts-fix", rule: "no-magic", filePath: "/x/a.ts", line: 2 })], config: {}, options: { sources: SRC_DISABLE_NS } },
  { name: "inline disable list", diagnostics: [diag({ rule: "b", filePath: "/x/a.ts", line: 2 }), diag({ rule: "z", filePath: "/x/a.ts", line: 2 })], config: {}, options: { sources: SRC_DISABLE_LIST } },
  { name: "inline disable crlf", diagnostics: [diag({ rule: "r", filePath: "/x/a.ts", line: 2 })], config: {}, options: { sources: SRC_CRLF } },
  { name: "inline disable line<=0 exempt", diagnostics: [diag({ rule: "x", filePath: "/x/a.ts", line: 0 }), diag({ rule: "x", filePath: "/x/a.ts", line: -3 })], config: {}, options: { sources: SRC_DISABLE_ALL } },
  { name: "inline disable wrong line survives", diagnostics: [diag({ rule: "no-magic", filePath: "/x/a.ts", line: 99 })], config: {}, options: { sources: SRC_DISABLE_RULE } },
  { name: "inline disable missing source survives", diagnostics: [diag({ rule: "no-magic", filePath: "/x/missing.ts", line: 2 })], config: {}, options: { sources: SRC_DISABLE_RULE } },
  // gating
  { name: "respectInlineDisables false skips stage", diagnostics: [diag({ rule: "no-magic", filePath: "/x/a.ts", line: 2 })], config: {}, options: { respectInlineDisables: false, sources: SRC_DISABLE_ALL } },
  { name: "default no sources no-op", diagnostics: [diag({ rule: "no-magic", filePath: "/x/a.ts", line: 2 })], config: {} },

  // Combined multi-stage
  {
    name: "all four stages combined",
    diagnostics: [
      diag({ rule: "noisy", tags: ["test-noise"], filePath: "/x/a.ts", line: 1 }), // stage1 drop
      diag({ rule: "off-me", filePath: "/x/a.ts", line: 2 }), // stage2 drop
      diag({ rule: "ignored", filePath: "/x/a.ts", line: 3 }), // stage3 rule drop
      diag({ rule: "infile", filePath: "/x/b.ts", line: 4 }), // stage3 file drop
      diag({ rule: "no-magic", filePath: "/x/a.ts", line: 6 }), // stage4 drop (directive on line 5)
      diag({ rule: "kept", filePath: "/x/a.ts", line: 8, severity: "error" }), // survives, remapped
    ],
    config: {
      rules: { "off-me": "off", kept: "warn" },
      ignore: { rules: ["ignored"], files: ["b.ts"] },
    },
    options: {
      sources: new Map([
        [
          "/x/a.ts",
          [
            "l1",
            "l2",
            "l3",
            "l4",
            "// ts-fix-disable-next-line no-magic",
            "const x: any = 1;",
            "l7",
            "const kept = 1;",
          ].join("\n"),
        ],
      ]),
    },
  },
];

// ===========================================================================
// THE PROOF
// ===========================================================================

describe("equivalence — RULE-023 oracle sanity", () => {
  it("the oracle actually drops things (so the proof is meaningful)", () => {
    const dropped = legacyRunFilterPipeline(
      [
        { ...diag({ rule: "n", tags: ["test-noise"] }) } as LegacyDiagnosticWithTags,
      ],
      {},
    );
    expect(dropped).toHaveLength(0);
  });
});

describe("equivalence — RULE-023 differential (modern === legacy, structural)", () => {
  let totalIn = 0;
  let totalOut = 0;

  for (const fx of fixtures) {
    it(`fixture: ${fx.name}`, () => {
      const modern = modernRun(
        fx.diagnostics,
        fx.config,
        fx.options ?? {},
      );
      const legacy = legacyRunFilterPipeline(
        fx.diagnostics as unknown as LegacyDiagnosticWithTags[],
        fx.config as unknown as LegacyTsFixConfig,
        (fx.options ?? {}) as LegacyFilterPipelineOptions,
      );
      // Structural deep equality — same survivors, same field values, same order,
      // tags stripped identically.
      expect(modern).toEqual(legacy);
      totalIn += fx.diagnostics.length;
      totalOut += modern.length;
    });
  }

  it("the fixture matrix exercised real drops (input > output)", () => {
    expect(totalIn).toBeGreaterThan(0);
    expect(totalOut).toBeLessThan(totalIn);
  });
});

describe("equivalence — RULE-040 out-of-vocab config severity falls through to error", () => {
  // Config vocab is error|warn|off; a stray engine token like "warning" is OUT of
  // contract (the loader/RULE-024 would normally never let it reach here). Both the
  // legacy `normalizeSeverity` and modern `normalizeConfigSeverity` map anything that
  // is neither "off" nor "warn" via the `else` branch to "error" (NOT "warning").
  // This pins that else-branch so it is a proven decision, not incidental behavior
  // (architecture review). The cast is deliberate — we are probing contract-violating input.
  it('a config value of "warning" maps to error in both pipelines', () => {
    const d = diag({ rule: "r", severity: "warning" });
    const cfg = { rules: { r: "warning" } } as unknown as TsFixConfig;
    const modern = modernRun([d], cfg, {});
    const legacy = legacyRunFilterPipeline(
      [d as unknown as LegacyDiagnosticWithTags],
      cfg as unknown as LegacyTsFixConfig,
      {},
    );
    expect(modern).toEqual(legacy);
    expect(modern[0]?.severity).toBe("error");
  });
});

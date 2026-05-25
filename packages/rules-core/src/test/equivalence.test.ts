/**
 * THE EQUIVALENCE PROOF — differential test, modern substrate vs frozen legacy
 * oracle (RULE-020 meta + the `createRuleContext` auto-fill + BC-13 identity).
 *
 * Goal: prove the modern `createRuleContext.report` builds a `Diagnostic` STRUCTURALLY
 * byte-for-byte identical to the legacy `define-rule.ts` algorithm, that each of the
 * 4 strictness rules' META deep-equals the legacy meta verbatim, and that
 * `diagnosticIdentity` matches the legacy oracle — over crafted `ReportInput`s.
 * Expect 100% equality (no deviation — this is a faithful substrate port).
 *
 * Strategy:
 *   1. Vendored, ATTRIBUTED frozen copies of the legacy algorithm as the oracle:
 *      - legacy `define-rule.ts:54-93` (createRuleContext + the conditional spread)
 *      - legacy `identity.ts:12-14` (diagnosticIdentity)
 *      - legacy `rules/strictness/*.ts` meta (the four rules, verbatim)
 *     Vendored so the oracle is self-contained and does NOT import the modern slice.
 *   2. Crafted ReportInputs: minimal, all-overrides, each-optional-present,
 *      each-optional-absent — exercising every conditional-spread arm.
 *   3. Assert modern report output === legacy report output via `toStrictEqual`
 *      (full structural equality of the built Diagnostic), modern meta === legacy
 *      meta, and modern identity === legacy identity.
 */

import { describe, expect, it } from "vitest";
import type ts from "typescript";
import type { Diagnostic, RuleMeta } from "@ts-doctor/contracts-effect";
import {
  createRuleContext,
  diagnosticIdentity,
  enableStrict,
  enableNoUncheckedIndexedAccess,
  enableExactOptionalPropertyTypes,
  enableUseUnknownInCatch,
} from "../main/index.js";
import type { ReportInput, Rule } from "../main/index.js";

// ===========================================================================
// ORACLE — frozen copy of legacy/ts-doctor/packages/ts-doctor-rules/src/define-rule.ts:54-93.
// createRuleContext.report auto-fill + the exactOptional conditional spread.
// For differential testing ONLY — do not "fix" it; it defines legacy behavior.
// ===========================================================================
const LEGACY_PLUGIN_NAME = "ts-doctor" as const;

function legacyCreateReport(
  meta: RuleMeta,
  sink: (d: Diagnostic) => void,
): (input: ReportInput) => void {
  return (input: ReportInput): void => {
    sink({
      plugin: LEGACY_PLUGIN_NAME,
      rule: input.rule ?? meta.id,
      tier: input.tier ?? meta.tier,
      category: input.category ?? meta.category,
      severity: input.severity ?? meta.severity,
      filePath: input.filePath,
      message: input.message,
      help: input.help,
      line: input.line,
      column: input.column,
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.fix !== undefined ? { fix: input.fix } : {}),
      ...(input.suppressionHint !== undefined
        ? { suppressionHint: input.suppressionHint }
        : {}),
    });
  };
}

// ===========================================================================
// ORACLE — frozen copy of legacy identity.ts:12-14 (BC-13).
// ===========================================================================
function legacyDiagnosticIdentity(d: Diagnostic): string {
  return `${d.filePath}::${d.line}:${d.column}::${d.plugin}/${d.rule}`;
}

// ===========================================================================
// ORACLE — frozen copy of the 4 rules' meta, verbatim from legacy
// rules/strictness/*.ts. For differential testing ONLY.
// ===========================================================================
const LEGACY_STRICTNESS_META: ReadonlyArray<RuleMeta> = [
  {
    id: "enable-strict",
    severity: "warning",
    category: "Compiler Strictness Gaps",
    tier: "CFG",
    requires: ["tsconfig"],
    disabledBy: ["strict"],
    fixKind: "manual",
    tags: ["strictness", "tsconfig"],
    message:
      "tsconfig `strict` is off — the full strict-mode check family is disabled.",
    recommendation:
      'Set `"strict": true` in tsconfig.json. It enables the full family of strict-mode checks (strictNullChecks, noImplicitAny, etc.) and is the single highest-leverage type-safety setting.',
  },
  {
    id: "enable-no-unchecked-indexed-access",
    severity: "warning",
    category: "Compiler Strictness Gaps",
    tier: "CFG",
    requires: ["tsconfig"],
    disabledBy: ["noUncheckedIndexedAccess"],
    fixKind: "manual",
    tags: ["strictness", "tsconfig"],
    message:
      "tsconfig `noUncheckedIndexedAccess` is off — indexed access is not typed as possibly `undefined`.",
    recommendation:
      'Set `"noUncheckedIndexedAccess": true` in tsconfig.json so indexed access (e.g. `arr[i]`, `record[key]`) is typed as possibly `undefined`, surfacing a large class of runtime errors at compile time.',
  },
  {
    id: "enable-exact-optional-property-types",
    severity: "warning",
    category: "Compiler Strictness Gaps",
    tier: "CFG",
    requires: ["tsconfig"],
    disabledBy: ["exactOptionalPropertyTypes"],
    fixKind: "manual",
    tags: ["strictness", "tsconfig"],
    message:
      "tsconfig `exactOptionalPropertyTypes` is off — `{ x?: T }` silently accepts `undefined` writes.",
    recommendation:
      'Set `"exactOptionalPropertyTypes": true` so an optional property `x?: T` is not implicitly `T | undefined`; an explicit `undefined` must then be opted into.',
  },
  {
    id: "enable-use-unknown-in-catch",
    severity: "warning",
    category: "Compiler Strictness Gaps",
    tier: "CFG",
    requires: ["tsconfig"],
    disabledBy: ["useUnknownInCatchVariables", "strict"],
    fixKind: "manual",
    tags: ["strictness", "tsconfig"],
    message:
      "tsconfig `useUnknownInCatchVariables` is off — `catch (e)` types `e` as `any`.",
    recommendation:
      'Set `"useUnknownInCatchVariables": true` (or `"strict": true`) so caught values are `unknown` and must be narrowed before use.',
  },
];

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------
const FAKE_SOURCE_FILE = { kind: 0 } as unknown as ts.SourceFile;

const META: RuleMeta = {
  id: "no-explicit-any",
  severity: "warning",
  category: "Type Safety",
  tier: "SYN",
};

const REPORT_FIXTURES: ReadonlyArray<{ name: string; input: ReportInput }> = [
  {
    name: "minimal — all defaults, no optionals",
    input: { filePath: "src/a.ts", message: "m", help: "h", line: 1, column: 1 },
  },
  {
    name: "all meta-derived fields overridden",
    input: {
      filePath: "src/b.ts",
      message: "m",
      help: "h",
      line: 9,
      column: 2,
      rule: "custom-rule",
      tier: "TYP",
      category: "Other",
      severity: "error",
    },
  },
  {
    name: "url present only",
    input: { filePath: "c.ts", message: "m", help: "h", line: 3, column: 4, url: "https://docs/x" },
  },
  {
    name: "fix present only",
    input: {
      filePath: "d.ts",
      message: "m",
      help: "h",
      line: 5,
      column: 6,
      fix: { kind: "auto-fix", edits: [{ start: 0, end: 3, replacement: "let" }] },
    },
  },
  {
    name: "suppressionHint present only",
    input: { filePath: "e.ts", message: "m", help: "h", line: 7, column: 8, suppressionHint: "near-miss" },
  },
  {
    name: "all three optionals present",
    input: {
      filePath: "f.ts",
      message: "m",
      help: "h",
      line: 10,
      column: 11,
      url: "https://docs/y",
      fix: { kind: "codemod", edits: [], inferredType: "string" },
      suppressionHint: "hint",
    },
  },
];

describe("equivalence — createRuleContext.report vs legacy oracle (structural equality)", () => {
  for (const { name, input } of REPORT_FIXTURES) {
    it(`modern report === legacy report: ${name}`, () => {
      const modernOut: Diagnostic[] = [];
      const modernCtx = createRuleContext(META, {
        sourceFile: FAKE_SOURCE_FILE,
        filePath: input.filePath,
        sink: (d) => modernOut.push(d),
      });
      modernCtx.report(input);

      const legacyOut: Diagnostic[] = [];
      legacyCreateReport(META, (d) => legacyOut.push(d))(input);

      expect(modernOut).toHaveLength(1);
      expect(legacyOut).toHaveLength(1);
      expect(modernOut[0]).toStrictEqual(legacyOut[0]);
    });
  }

  it("traverses every report fixture (harness guard)", () => {
    expect(REPORT_FIXTURES.length).toBeGreaterThanOrEqual(6);
  });
});

describe("equivalence — strictness rule meta vs legacy oracle (verbatim)", () => {
  const MODERN: ReadonlyArray<Rule> = [
    enableStrict,
    enableNoUncheckedIndexedAccess,
    enableExactOptionalPropertyTypes,
    enableUseUnknownInCatch,
  ];

  function metaOf(rule: Rule): RuleMeta {
    const { create: _create, ...meta } = rule;
    return meta;
  }

  for (const legacy of LEGACY_STRICTNESS_META) {
    it(`modern meta === legacy meta: ${legacy.id}`, () => {
      const modern = MODERN.find((r) => r.id === legacy.id);
      expect(modern, `missing rule ${legacy.id}`).toBeDefined();
      expect(metaOf(modern!)).toStrictEqual(legacy);
    });
  }
});

describe("equivalence — diagnosticIdentity vs legacy oracle (BC-13)", () => {
  const DIAGS: ReadonlyArray<Diagnostic> = [
    {
      filePath: "src/foo.ts",
      plugin: "ts-doctor",
      rule: "no-explicit-any",
      severity: "warning",
      message: "m",
      help: "h",
      line: 12,
      column: 4,
      category: "Type Safety",
      tier: "SYN",
    },
    {
      filePath: "tsconfig.json",
      plugin: "ts-doctor",
      rule: "enable-strict",
      severity: "warning",
      message: "m",
      help: "h",
      line: 1,
      column: 1,
      category: "Compiler Strictness Gaps",
      tier: "CFG",
    },
    {
      filePath: "a/b/c.tsx",
      plugin: "other-plugin",
      rule: "x",
      severity: "error",
      message: "m",
      help: "h",
      line: 0,
      column: 0,
      category: "c",
      tier: "GRAPH",
    },
  ];

  for (const d of DIAGS) {
    it(`modern identity === legacy identity: ${d.filePath}/${d.rule}`, () => {
      expect(diagnosticIdentity(d)).toBe(legacyDiagnosticIdentity(d));
    });
  }
});

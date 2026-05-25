/**
 * Characterization — the 4 AST-free `strictness` rules (RULE-020 inverted CFG
 * gating). Each is `defineRule(meta, () => ({}))`: its ENTIRE behavior is the
 * activation decision driven by its META. These tests pin the EXACT meta verbatim
 * (id/severity/category/tier/requires/disabledBy/fixKind/tags/message/recommendation)
 * and that `create()` returns `{}` (no visitors).
 *
 * RULE-020 gating SEMANTICS (documented, not re-implemented here): each rule fires
 * iff its `disabledBy` token is ABSENT from the project's capability set. The actual
 * `shouldActivate` predicate is the CAPABILITIES slice's — NOT tested here; we
 * assert the META that drives it. `enable-use-unknown-in-catch` carries a DUAL gate
 * `disabledBy: ["useUnknownInCatchVariables", "strict"]` (`strict` implies the flag).
 */

import { describe, expect, it } from "vitest";
import type ts from "typescript";
import type { RuleMeta } from "@tsnuke/contracts-effect";
import {
  enableStrict,
  enableNoUncheckedIndexedAccess,
  enableExactOptionalPropertyTypes,
  enableUseUnknownInCatch,
} from "../main/index.js";
import type { Rule } from "../main/index.js";

// The four rules' meta, copied VERBATIM from legacy `rules/strictness/*.ts`. The
// expected oracle — every field, exact strings, exact array order/contents.
const EXPECTED: Record<string, RuleMeta> = {
  "enable-strict": {
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
  "enable-no-unchecked-indexed-access": {
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
  "enable-exact-optional-property-types": {
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
  "enable-use-unknown-in-catch": {
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
};

const RULES: ReadonlyArray<Rule> = [
  enableStrict,
  enableNoUncheckedIndexedAccess,
  enableExactOptionalPropertyTypes,
  enableUseUnknownInCatch,
];

// A rule is `RuleMeta & { create }`. Strip `create` to compare just the meta.
function metaOf(rule: Rule): RuleMeta {
  const { create: _create, ...meta } = rule;
  return meta;
}

describe("RULE-020 strictness rules — EXACT meta (verbatim from legacy)", () => {
  for (const rule of RULES) {
    it(`${rule.id}: meta deep-equals the verbatim legacy meta`, () => {
      const expected = EXPECTED[rule.id];
      expect(expected, `unexpected rule id: ${rule.id}`).toBeDefined();
      expect(metaOf(rule)).toStrictEqual(expected);
    });
  }

  it("covers exactly the 4 expected ids", () => {
    expect(RULES.map((r) => r.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });
});

describe("RULE-020 strictness rules — AST-free (create returns {})", () => {
  for (const rule of RULES) {
    it(`${rule.id}: create() returns an empty visitor set`, () => {
      const ctx = {
        sourceFile: {} as ts.SourceFile,
        filePath: "x.ts",
        report: () => {},
      };
      expect(rule.create(ctx)).toStrictEqual({});
      expect(Object.keys(rule.create(ctx))).toHaveLength(0);
    });
  }
});

describe("RULE-031/032 — severity vocabulary & fix-kind taxonomy in meta", () => {
  it("every strictness rule is a CFG warning with manual fixKind", () => {
    for (const rule of RULES) {
      expect(rule.tier).toBe("CFG");
      expect(rule.severity).toBe("warning"); // RULE-031: no `info` level
      expect(rule.fixKind).toBe("manual"); // RULE-032: config edits are manual
    }
  });
});

describe("RULE-020 — gating META that drives `shouldActivate` (capabilities slice)", () => {
  it("all four require `tsconfig` (a tsconfig must exist)", () => {
    for (const rule of RULES) expect(rule.requires).toEqual(["tsconfig"]);
  });

  it("each single-token gate fires iff its flag token is ABSENT", () => {
    // The rule activates when the token is NOT in the capability set, and
    // self-disables once the flag is ON (token present). We assert the gate token.
    expect(enableStrict.disabledBy).toEqual(["strict"]);
    expect(enableNoUncheckedIndexedAccess.disabledBy).toEqual([
      "noUncheckedIndexedAccess",
    ]);
    expect(enableExactOptionalPropertyTypes.disabledBy).toEqual([
      "exactOptionalPropertyTypes",
    ]);
  });

  it("enable-use-unknown-in-catch has the DUAL gate (strict implies the flag)", () => {
    expect(enableUseUnknownInCatch.disabledBy).toEqual([
      "useUnknownInCatchVariables",
      "strict",
    ]);
  });
});

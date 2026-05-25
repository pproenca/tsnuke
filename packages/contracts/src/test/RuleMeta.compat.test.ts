/**
 * COMPATIBILITY / SUPERSET PROOF — canonical `RuleMeta` + `Capability` vs the legacy
 * type AND the capabilities slice's vendored SUBSET (RULE-019).
 *
 * The capabilities slice vendors a MINIMAL RuleMeta (id/severity/category/tier +
 * the four gate fields requires?/disabledBy?/tags?/defaultEnabled?). The legacy full
 * `RuleMeta` (`ts-doctor-rules/src/types.ts:98-123`) ALSO carries fixKind?/message?/
 * recommendation?. The canonical RuleMeta here is the FULL legacy contract.
 *
 * These tests PIN that the canonical RuleMeta accepts every shape the capabilities
 * subset produces (so capabilities can de-vendor onto this), and rejects out-of-contract
 * values. Sample values are inline — we are proving a structural superset, not importing.
 */

import { Either, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Capability, RuleMeta } from "../main/index.js";

const decode = <A, I>(s: Schema.Schema<A, I>) => Schema.decodeUnknownEither(s);
const accepts = <A, I>(s: Schema.Schema<A, I>, v: unknown): boolean =>
  Either.isRight(decode(s)(v));
const rejects = <A, I>(s: Schema.Schema<A, I>, v: unknown): boolean =>
  Either.isLeft(decode(s)(v));

describe("Capability — opaque string token", () => {
  it("accepts representative capability tokens", () => {
    for (const c of ["ts:5.8", "strict", "typecheck:ok", "noUncheckedIndexedAccess"]) {
      expect(accepts(Capability, c)).toBe(true);
    }
  });
  it("rejects non-strings", () => {
    expect(rejects(Capability, 5.8)).toBe(true);
    expect(rejects(Capability, null)).toBe(true);
  });
});

describe("RuleMeta — canonical Schema is a SUPERSET of legacy + the capabilities subset", () => {
  // The minimal required shape both legacy and the capabilities subset agree on.
  const requiredFields = {
    id: "no-ts-ignore",
    severity: "error" as const,
    category: "suppression",
    tier: "SYN" as const,
  };

  it("accepts the minimal required-field shape (no optionals)", () => {
    expect(accepts(RuleMeta, requiredFields)).toBe(true);
  });

  it("accepts the FULL capabilities-subset shape (the four gate fields present)", () => {
    // This is the exact superset of what capabilities' vendored RuleMeta accepts.
    expect(
      accepts(RuleMeta, {
        ...requiredFields,
        requires: ["typecheck:ok", "strict"],
        disabledBy: ["legacy-mode"],
        tags: ["ai-suspect"],
        defaultEnabled: false,
      }),
    ).toBe(true);
  });

  it("accepts the FULL legacy shape incl. fixKind/message/recommendation (canonical extras)", () => {
    expect(
      accepts(RuleMeta, {
        ...requiredFields,
        tier: "CFG",
        requires: ["typecheck:ok"],
        disabledBy: [],
        tags: [],
        defaultEnabled: true,
        fixKind: "codemod",
        message: "tsconfig is missing `strict`",
        recommendation: "Enable `strict` in tsconfig.json",
      }),
    ).toBe(true);
  });

  it("accepts defaultEnabled omitted (default-on) AND defaultEnabled === true/false", () => {
    // RULE-019: omitted => default-on; only === false opts out. Schema permits all three.
    expect(accepts(RuleMeta, requiredFields)).toBe(true);
    expect(accepts(RuleMeta, { ...requiredFields, defaultEnabled: true })).toBe(true);
    expect(accepts(RuleMeta, { ...requiredFields, defaultEnabled: false })).toBe(true);
  });

  it("accepts a capabilities-subset value WITHOUT the canonical-extra fields (de-vendor proof)", () => {
    // The capabilities slice never sets fixKind/message/recommendation — prove its
    // narrower output is valid under the full RuleMeta.
    const capabilitiesShape = {
      id: "no-cycles",
      severity: "warning" as const,
      category: "graph",
      tier: "GRAPH" as const,
      requires: ["typecheck:ok"],
      tags: ["architecture"],
    };
    expect(accepts(RuleMeta, capabilitiesShape)).toBe(true);
  });

  it("rejects out-of-contract values (info severity, bogus tier, non-array requires)", () => {
    expect(rejects(RuleMeta, { ...requiredFields, severity: "info" })).toBe(true);
    expect(rejects(RuleMeta, { ...requiredFields, tier: "LINT" })).toBe(true);
    expect(rejects(RuleMeta, { ...requiredFields, requires: "typecheck:ok" })).toBe(true);
    expect(rejects(RuleMeta, { ...requiredFields, fixKind: "quickfix" })).toBe(true);
  });

  it("rejects a RuleMeta missing a required field (e.g. no `id`)", () => {
    const { id: _omit, ...noId } = requiredFields;
    expect(rejects(RuleMeta, noId)).toBe(true);
  });
});

describe("RuleMeta — round-trip decode(encode(x)) === x", () => {
  it("round-trips a representative full RuleMeta", () => {
    const value: typeof RuleMeta.Type = {
      id: "no-explicit-any",
      severity: "warning",
      category: "types",
      tier: "TYP",
      requires: ["typecheck:ok"],
      disabledBy: ["js-only"],
      tags: ["ai-suspect"],
      defaultEnabled: true,
      fixKind: "auto-fix",
      message: "explicit any used at project level",
      recommendation: "Prefer unknown",
    };
    const decoded = Schema.decodeSync(RuleMeta)(Schema.encodeSync(RuleMeta)(value));
    expect(decoded).toStrictEqual(value);
  });

  it("round-trips a minimal RuleMeta (no optionals — capabilities-style)", () => {
    const value: typeof RuleMeta.Type = {
      id: "r",
      severity: "error",
      category: "c",
      tier: "SYN",
    };
    expect(Schema.decodeSync(RuleMeta)(Schema.encodeSync(RuleMeta)(value))).toStrictEqual(value);
  });
});

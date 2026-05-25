/**
 * COMPATIBILITY / SUPERSET PROOF — canonical `Diagnostic` family vs the legacy type
 * AND every vendored copy (RULE-031/032; architecture-critic cross-cutting follow-up).
 *
 * This package consolidates the `Diagnostic`/`Severity`/`Tier`/`FixKind`/`TextEdit`/`Fix`
 * contracts that score, filter-pipeline, and build-report each vendor today. These tests
 * PIN that the canonical Schemas are a faithful structural SUPERSET of:
 *   - the legacy `import type` interfaces (`packages/ts-fix-rules/src/types.ts`), and
 *   - every vendored copy's accepted shapes
 * so de-vendoring later (delete the local copy, import from here) is provably safe.
 *
 * We construct sample values INLINE (not by importing the vendored packages) — the point
 * is to assert the canonical contract accepts every shape the narrower copies produce,
 * and rejects out-of-contract values (e.g. Severity rejects "info"). Decode is the gate.
 */

import { Either, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  Diagnostic,
  FixKind,
  Severity,
  Tier,
} from "../main/index.js";

const decode = <A, I>(s: Schema.Schema<A, I>) => Schema.decodeUnknownEither(s);
const accepts = <A, I>(s: Schema.Schema<A, I>, v: unknown): boolean =>
  Either.isRight(decode(s)(v));
const rejects = <A, I>(s: Schema.Schema<A, I>, v: unknown): boolean =>
  Either.isLeft(decode(s)(v));

describe("Severity — canonical literal union accepts both engine values, rejects out-of-contract", () => {
  // RULE-031: ts-fix v1 has NO "info" level. All five vendored copies use the
  // identical `Schema.Literal("error", "warning")`. This is the canonical home.
  it("accepts every value the legacy `Severity` type and all vendored copies produce", () => {
    expect(accepts(Severity, "error")).toBe(true);
    expect(accepts(Severity, "warning")).toBe(true);
  });

  it('rejects "info" (RULE-031 — no info level) and the config vocab "warn"/"off"', () => {
    // "warn"/"off" belong to ConfigSeverity (Config.ts), NOT engine Severity (RULE-040).
    expect(rejects(Severity, "info")).toBe(true);
    expect(rejects(Severity, "warn")).toBe(true);
    expect(rejects(Severity, "off")).toBe(true);
    expect(rejects(Severity, "")).toBe(true);
    expect(rejects(Severity, 0)).toBe(true);
  });
});

describe("Tier — canonical literal union (BC-10) is the superset all copies share", () => {
  it("accepts the four legacy tiers (score/filter-pipeline/build-report/capabilities copies)", () => {
    for (const t of ["SYN", "TYP", "GRAPH", "CFG"]) {
      expect(accepts(Tier, t)).toBe(true);
    }
  });
  it("rejects unknown tiers", () => {
    expect(rejects(Tier, "LINT")).toBe(true);
    expect(rejects(Tier, "syn")).toBe(true);
  });
});

describe("FixKind — canonical literal union (RULE-032)", () => {
  it("accepts the three legacy fix kinds", () => {
    for (const k of ["auto-fix", "codemod", "manual"]) {
      expect(accepts(FixKind, k)).toBe(true);
    }
  });
  it("rejects unknown fix kinds", () => {
    expect(rejects(FixKind, "quickfix")).toBe(true);
  });
});

describe("Diagnostic — canonical Schema is a SUPERSET of legacy + every vendored copy", () => {
  // The minimal-but-complete required shape (legacy `Diagnostic`, all required fields).
  const requiredFields = {
    filePath: "src/a.ts",
    plugin: "ts-fix",
    rule: "no-ts-ignore",
    severity: "error" as const,
    message: "Found a @ts-ignore",
    help: "Use @ts-expect-error",
    line: 10,
    column: 3,
    category: "suppression",
    tier: "SYN" as const,
  };

  it("accepts the minimal required-field shape (no optionals) — legacy + all copies", () => {
    // This is the smallest shape score/build-report/filter-pipeline all accept.
    expect(accepts(Diagnostic, requiredFields)).toBe(true);
  });

  it("accepts the score slice's scoring projection augmented to full required shape", () => {
    // score reads only plugin/rule/severity (RULE-001) but its Diagnostic struct is the
    // full required shape — assert the canonical accepts it.
    expect(
      accepts(Diagnostic, {
        ...requiredFields,
        plugin: "ts-fix",
        rule: "err-0",
        severity: "warning",
      }),
    ).toBe(true);
  });

  it("accepts the FULL shape with every optional present (url/fix/suppressionHint)", () => {
    expect(
      accepts(Diagnostic, {
        ...requiredFields,
        url: "https://ts-fix.dev/rules/no-ts-ignore",
        suppressionHint: "ts-fix-disable-next-line no-ts-ignore",
        fix: {
          kind: "auto-fix",
          edits: [{ start: 0, end: 11, replacement: "@ts-expect-error" }],
          inferredType: "string",
        },
      }),
    ).toBe(true);
  });

  it("accepts a fix with NO edits and NO inferredType (codemod with deferred edits)", () => {
    expect(
      accepts(Diagnostic, {
        ...requiredFields,
        fix: { kind: "codemod", edits: [] },
      }),
    ).toBe(true);
  });

  it("accepts the build-report carry shape (reads only severity/filePath, RULE-004)", () => {
    // build-report carries every other field verbatim into the report — full shape.
    expect(
      accepts(Diagnostic, {
        ...requiredFields,
        severity: "warning",
        tier: "TYP",
        fix: { kind: "manual", edits: [] },
      }),
    ).toBe(true);
  });

  it("accepts line <= 0 (filter-pipeline notes <=0 is exempt from inline-disable, RULE-023)", () => {
    // The contract permits any Int for line/column; the SEMANTIC of <=0 lives in the
    // pipeline, not the schema. Pin that the canonical does not over-constrain.
    expect(accepts(Diagnostic, { ...requiredFields, line: 0, column: 0 })).toBe(true);
    expect(accepts(Diagnostic, { ...requiredFields, line: -1 })).toBe(true);
  });

  it("rejects out-of-contract values (info severity, bogus tier, non-int line)", () => {
    expect(rejects(Diagnostic, { ...requiredFields, severity: "info" })).toBe(true);
    expect(rejects(Diagnostic, { ...requiredFields, tier: "LINT" })).toBe(true);
    expect(rejects(Diagnostic, { ...requiredFields, line: 1.5 })).toBe(true);
  });

  it("rejects a Diagnostic missing a required field (e.g. no `tier`)", () => {
    const { tier: _omit, ...noTier } = requiredFields;
    expect(rejects(Diagnostic, noTier)).toBe(true);
  });

  it("rejects an invalid fix kind inside `fix`", () => {
    expect(
      rejects(Diagnostic, {
        ...requiredFields,
        fix: { kind: "quickfix", edits: [] },
      }),
    ).toBe(true);
  });

  it("DOES NOT model the engine-only `tags` carry — that stays in filter-pipeline (DiagnosticWithTags)", () => {
    // filter-pipeline's DiagnosticWithTags is its INPUT shape; the public Diagnostic it
    // emits strips `tags`. The canonical Diagnostic is the PUBLIC shape. With Effect's
    // default decode, an extra `tags` key is simply ignored (not rejected), so a
    // DiagnosticWithTags value still decodes as a valid canonical Diagnostic.
    expect(
      accepts(Diagnostic, { ...requiredFields, tags: ["unstable", "ai-suspect"] }),
    ).toBe(true);
  });
});

describe("Diagnostic — round-trip decode(encode(x)) === x", () => {
  it("round-trips a representative full Diagnostic", () => {
    const value: typeof Diagnostic.Type = {
      filePath: "src/index.ts",
      plugin: "ts-fix",
      rule: "no-explicit-any",
      severity: "warning",
      message: "Avoid explicit any",
      help: "Use unknown",
      url: "https://ts-fix.dev/rules/no-explicit-any",
      line: 42,
      column: 7,
      category: "types",
      tier: "TYP",
      fix: {
        kind: "auto-fix",
        edits: [{ start: 100, end: 103, replacement: "unknown" }],
        inferredType: "unknown",
      },
      suppressionHint: "ts-fix-disable-next-line no-explicit-any",
    };
    const encoded = Schema.encodeSync(Diagnostic)(value);
    const decoded = Schema.decodeSync(Diagnostic)(encoded);
    expect(decoded).toStrictEqual(value);
  });

  it("round-trips a minimal Diagnostic (no optionals)", () => {
    const value: typeof Diagnostic.Type = {
      filePath: "a.ts",
      plugin: "ts-fix",
      rule: "r",
      severity: "error",
      message: "m",
      help: "h",
      line: 1,
      column: 1,
      category: "c",
      tier: "CFG",
    };
    expect(Schema.decodeSync(Diagnostic)(Schema.encodeSync(Diagnostic)(value))).toStrictEqual(
      value,
    );
  });
});

/**
 * Characterization tests for the vendored `effect/Schema` contract (RULE-019).
 *
 * The predicate stays plain & pure, but the relevant subset of the rule contract
 * (`Severity`, `Capability`, the activation-relevant `RuleMeta` fields) is modeled
 * as `effect/Schema` so callers get a single runtime decode gate for untrusted
 * rule metadata. These tests pin: the literal `Severity` union, that optional gate
 * fields are genuinely optional, and that `decodeRuleMeta` accepts/rejects correctly.
 */

import { Either, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  Capability,
  RuleMeta,
  Severity,
  decodeRuleMeta,
  shouldActivate,
} from "../main/index.js";

describe("Severity — RULE-019 (literal union, no 'info')", () => {
  const decode = Schema.decodeUnknownEither(Severity);

  it("accepts 'error' and 'warning'", () => {
    expect(Either.isRight(decode("error"))).toBe(true);
    expect(Either.isRight(decode("warning"))).toBe(true);
  });

  it("rejects 'info' (tsnuke v1 has no info level)", () => {
    expect(Either.isLeft(decode("info"))).toBe(true);
  });
});

describe("Capability — RULE-019 (opaque string token)", () => {
  const decode = Schema.decodeUnknownEither(Capability);

  it("accepts any string token (e.g. 'ts:5.8', 'strict')", () => {
    expect(Either.isRight(decode("strict"))).toBe(true);
    expect(Either.isRight(decode("ts:5.8"))).toBe(true);
  });

  it("rejects a non-string", () => {
    expect(Either.isLeft(decode(42))).toBe(true);
  });
});

describe("RuleMeta — RULE-019 (activation contract subset)", () => {
  it("decodes a minimal rule (required fields only; gate fields omitted)", () => {
    const result = decodeRuleMeta({
      id: "no-any",
      severity: "error",
      category: "correctness",
      tier: "SYN",
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("decodes a fully-specified rule with all optional gate fields", () => {
    const result = decodeRuleMeta({
      id: "enable-strict",
      severity: "warning",
      category: "strictness",
      tier: "CFG",
      requires: ["tsconfig"],
      disabledBy: ["strict"],
      tags: ["style"],
      defaultEnabled: false,
    });
    expect(Either.isRight(result)).toBe(true);
  });

  it("rejects a rule missing a required field (id)", () => {
    const result = decodeRuleMeta({
      severity: "error",
      category: "correctness",
      tier: "SYN",
    });
    expect(Either.isLeft(result)).toBe(true);
  });

  it("rejects an invalid severity", () => {
    const result = decodeRuleMeta({
      id: "r",
      severity: "info",
      category: "c",
      tier: "SYN",
    });
    expect(Either.isLeft(result)).toBe(true);
  });

  it("rejects an invalid tier", () => {
    const result = decodeRuleMeta({
      id: "r",
      severity: "error",
      category: "c",
      tier: "LINT",
    });
    expect(Either.isLeft(result)).toBe(true);
  });

  it("a decoded RuleMeta is consumable by the predicate (contract feeds the function)", () => {
    const result = decodeRuleMeta({
      id: "enable-strict",
      severity: "warning",
      category: "strictness",
      tier: "CFG",
      requires: ["tsconfig"],
      disabledBy: ["strict"],
    });
    // structural sanity: the decoded value carries the gate fields the predicate reads.
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      const meta: RuleMeta = result.right;
      expect(meta.requires).toEqual(["tsconfig"]);
      expect(meta.disabledBy).toEqual(["strict"]);
      // Demonstrate the trust-boundary seam END-TO-END (architecture review): a decoded
      // (untrusted) RuleMeta flows straight into the predicate, exercising RULE-019/020
      // inverted gating — "strict" ABSENT → enable-strict ACTIVE; PRESENT → disabled.
      expect(shouldActivate(meta, new Set(["tsconfig"]), new Set())).toBe(true);
      expect(shouldActivate(meta, new Set(["tsconfig", "strict"]), new Set())).toBe(false);
    }
  });
});

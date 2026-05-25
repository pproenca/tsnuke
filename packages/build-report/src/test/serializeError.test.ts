/**
 * Characterization tests for `serializeError` — RULE-034 (error serialization).
 *
 * Legacy `build-report.ts:50-61`:
 *   - For an `Error`: `{ message, name, chain }` where `chain` is the `.cause`
 *     chain flattened to messages, ROOT-LAST (top error's message is in `message`,
 *     NOT in `chain`; each cause's message is appended in walk order, so the
 *     deepest/root cause is the LAST element of `chain`).
 *   - For a non-Error: `{ message: String(err), name: "UnknownError", chain: [] }`.
 *   - The walk stops at the first non-Error `.cause` (e.g. a string cause is not
 *     appended and terminates the chain).
 */

import { describe, expect, it } from "vitest";
import { serializeError } from "../main/index.js";

describe("serializeError — RULE-034 (plain Error)", () => {
  it("an Error with no cause -> message + name, empty chain", () => {
    const err = new Error("top");
    expect(serializeError(err)).toStrictEqual({
      message: "top",
      name: "Error",
      chain: [],
    });
  });

  it("preserves a custom error name", () => {
    class DiscoveryError extends Error {
      override name = "DiscoveryError";
    }
    expect(serializeError(new DiscoveryError("nope"))).toStrictEqual({
      message: "nope",
      name: "DiscoveryError",
      chain: [],
    });
  });
});

describe("serializeError — RULE-034 (cause chain flattening, ROOT-LAST)", () => {
  it("a single cause -> chain has the cause message", () => {
    const root = new Error("root cause");
    const top = new Error("top", { cause: root });
    expect(serializeError(top)).toStrictEqual({
      message: "top",
      name: "Error",
      chain: ["root cause"],
    });
  });

  it("a deep cause chain is flattened root-LAST (top excluded from chain)", () => {
    const root = new Error("root");
    const mid = new Error("mid", { cause: root });
    const top = new Error("top", { cause: mid });
    const result = serializeError(top);
    // top's message lives in `message`, not `chain`. The chain is the causes in
    // walk order: mid first, root last.
    expect(result.message).toBe("top");
    expect(result.chain).toStrictEqual(["mid", "root"]);
    // explicit: the root cause is the LAST element.
    expect(result.chain[result.chain.length - 1]).toBe("root");
  });

  it("stops walking at the first non-Error cause (e.g. a string cause)", () => {
    const top = new Error("top", { cause: "a string, not an Error" });
    // the string cause is not an Error, so it is neither appended nor walked.
    expect(serializeError(top)).toStrictEqual({
      message: "top",
      name: "Error",
      chain: [],
    });
  });

  it("stops at a non-Error cause partway down the chain", () => {
    const mid = new Error("mid", { cause: { not: "an error" } });
    const top = new Error("top", { cause: mid });
    expect(serializeError(top)).toStrictEqual({
      message: "top",
      name: "Error",
      chain: ["mid"], // the object cause under mid terminates the walk.
    });
  });
});

describe("serializeError — RULE-034 (non-Error inputs)", () => {
  it("a string -> { message: String(err), name: 'UnknownError', chain: [] }", () => {
    expect(serializeError("boom")).toStrictEqual({
      message: "boom",
      name: "UnknownError",
      chain: [],
    });
  });

  it("a number is stringified", () => {
    expect(serializeError(42)).toStrictEqual({
      message: "42",
      name: "UnknownError",
      chain: [],
    });
  });

  it("null -> 'null'", () => {
    expect(serializeError(null)).toStrictEqual({
      message: "null",
      name: "UnknownError",
      chain: [],
    });
  });

  it("undefined -> 'undefined'", () => {
    expect(serializeError(undefined)).toStrictEqual({
      message: "undefined",
      name: "UnknownError",
      chain: [],
    });
  });

  it("a plain object -> String(obj) = '[object Object]'", () => {
    expect(serializeError({ a: 1 })).toStrictEqual({
      message: "[object Object]",
      name: "UnknownError",
      chain: [],
    });
  });
});

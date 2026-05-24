import { describe, expect, it } from "vitest";
import { rule } from "./no-record-string-unknown.js";
import { runRule } from "../../test-utils.js";

describe("no-record-string-unknown (SYN)", () => {
  it("flags a `Record<string, unknown>` type alias", () => {
    expect(runRule(rule, "export type Args = Record<string, unknown>;\n")).toHaveLength(1);
  });

  it("flags `Record<string, any>` in a parameter", () => {
    expect(
      runRule(rule, "export function f(a: Record<string, any>): void {}\n"),
    ).toHaveLength(1);
  });

  it("flags an index-signature-only object type", () => {
    expect(runRule(rule, "type Bag = { [k: string]: unknown };\n")).toHaveLength(1);
  });

  it("flags `interface X extends Record<string, unknown>`", () => {
    expect(
      runRule(rule, "export interface Args extends Record<string, unknown> { root?: string }\n"),
    ).toHaveLength(1);
  });

  it("does NOT flag a real interface or a typed record", () => {
    expect(runRule(rule, "type Real = { id: number; name: string };\n")).toHaveLength(0);
    expect(runRule(rule, "type M = Record<string, number>;\n")).toHaveLength(0);
  });
});

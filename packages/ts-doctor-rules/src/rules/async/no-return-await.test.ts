import { describe, expect, it } from "vitest";
import { rule } from "./no-return-await.js";
import { runRule } from "../../test-utils.js";

describe("no-return-await (SYN)", () => {
  it("flags a redundant `return await`", () => {
    const code =
      "declare function g(): Promise<number>;\nasync function f() { return await g(); }\n";
    const diags = runRule(rule, code);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("no-return-await");
    expect(diags[0]!.tier).toBe("SYN");
    expect(diags[0]!.severity).toBe("warning");
  });

  it("does not flag `return await` inside a try block", () => {
    const code =
      "declare function g(): Promise<number>;\nasync function f() { try { return await g(); } catch { return 0; } }\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("does not flag a plain `return` of a promise", () => {
    const code =
      "declare function g(): Promise<number>;\nasync function f() { return g(); }\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  it("flags `return await` in a try when it sits in a nested function (function boundary)", () => {
    // The inner arrow's `return await` is NOT inside its own try, so it is flagged.
    const code =
      "declare function g(): Promise<number>;\nasync function f() { try { const h = async () => { return await g(); }; return h(); } catch { return 0; } }\n";
    expect(runRule(rule, code)).toHaveLength(1);
  });
});

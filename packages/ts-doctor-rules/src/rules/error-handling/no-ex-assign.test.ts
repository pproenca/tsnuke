import { describe, expect, it } from "vitest";
import { rule } from "./no-ex-assign.js";
import { runRule } from "../../test-utils.js";

describe("no-ex-assign (SYN)", () => {
  it("flags reassigning the caught exception variable", () => {
    const diags = runRule(
      rule,
      'try { f(); } catch (e) { e = new Error("x"); }\n',
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("e");
  });

  it("does not flag merely using the caught exception variable", () => {
    expect(runRule(rule, "try { f(); } catch (e) { log(e); }\n")).toHaveLength(
      0,
    );
  });
});

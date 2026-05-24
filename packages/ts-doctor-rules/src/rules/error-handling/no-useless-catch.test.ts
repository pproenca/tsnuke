import { describe, expect, it } from "vitest";
import { rule } from "./no-useless-catch.js";
import { runRule } from "../../test-utils.js";

describe("no-useless-catch (SYN)", () => {
  it("flags a catch that only rethrows the caught value", () => {
    const diags = runRule(rule, "try { f(); } catch (e) { throw e; }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("does not flag a catch that does more than rethrow", () => {
    expect(
      runRule(rule, "try { f(); } catch (e) { log(e); throw e; }\n"),
    ).toHaveLength(0);
  });

  it("does not flag a catch that wraps the error", () => {
    expect(
      runRule(
        rule,
        'try { f(); } catch (e) { throw new Error("wrap", { cause: e }); }\n',
      ),
    ).toHaveLength(0);
  });
});

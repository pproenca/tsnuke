import { describe, expect, it } from "vitest";
import { rule } from "./no-empty-catch.js";
import { runRule } from "../../test-utils.js";

describe("no-empty-catch (SYN)", () => {
  it("flags a truly empty catch block", () => {
    expect(runRule(rule, "try { f(); } catch (e) {}\n")).toHaveLength(1);
  });

  it("allows a comment-only catch (documented intentional swallow)", () => {
    expect(
      runRule(rule, "try { f(); } catch (e) { /* ignore: best-effort */ }\n"),
    ).toHaveLength(0);
  });

  it("allows a handled catch", () => {
    expect(runRule(rule, "try { f(); } catch (e) { log(e); }\n")).toHaveLength(0);
  });
});

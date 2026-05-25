import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-ex-assign.js";

describe("no-ex-assign (SYN)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags reassigning the caught exception variable", () => {
    const diags = runRule(rule, 'try { f(); } catch (e) { e = new Error("x"); }\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("e");
  });

  it("does not flag merely using the caught exception variable", () => {
    expect(runRule(rule, "try { f(); } catch (e) { log(e); }\n")).toHaveLength(0);
  });

  // --- Added edge cases (severity=error, compound assign, position/rule-id) ---

  it("carries the verbatim message/help + meta + rule-id in the diagnostic", () => {
    const diags = runRule(rule, 'try { f(); } catch (e) { e = new Error("x"); }\n');
    expect(diags[0]!.rule).toBe("no-ex-assign");
    expect(diags[0]!.message).toBe(
      "Don't reassign the caught exception variable `e`; it loses the original error.",
    );
    expect(diags[0]!.help).toBe(
      "Preserve the caught error — assign to a new variable instead of overwriting the catch binding.",
    );
    expect(diags[0]!.severity).toBe("error");
    expect(diags[0]!.category).toBe("Error Handling");
    expect(diags[0]!.tier).toBe("SYN");
  });

  it("flags a compound assignment to the binding (`e += ...`)", () => {
    expect(
      runRule(rule, 'try { f(); } catch (e) { e += "x"; }\n'),
    ).toHaveLength(1);
  });

  it("flags a logical-assignment to the binding (`e ??= ...`)", () => {
    expect(
      runRule(rule, "try { f(); } catch (e) { e ??= fallback; }\n"),
    ).toHaveLength(1);
  });

  it("reports the diagnostic at the assignment expression, not the catch", () => {
    // `e =` begins at 0-based char 25 ⇒ 1-based column 26.
    const diags = runRule(rule, 'try { f(); } catch (e) { e = new Error("x"); }\n');
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(26);
  });

  it("does NOT flag assigning a DIFFERENT variable inside the catch", () => {
    expect(
      runRule(rule, 'try { f(); } catch (e) { let m = "x"; m = "y"; }\n'),
    ).toHaveLength(0);
  });

  it("does NOT flag a catch with no binding", () => {
    expect(runRule(rule, "try { f(); } catch { g(); }\n")).toHaveLength(0);
  });
});

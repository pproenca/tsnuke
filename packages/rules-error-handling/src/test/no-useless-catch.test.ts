import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/no-useless-catch.js";

describe("no-useless-catch (SYN)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

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

  // --- Added edge cases (message/severity/rule-id/position + boundary) ---

  it("carries the verbatim message/help + meta + rule-id in the diagnostic", () => {
    const diags = runRule(rule, "try { f(); } catch (e) { throw e; }\n");
    expect(diags[0]!.rule).toBe("no-useless-catch");
    expect(diags[0]!.message).toBe("this catch only rethrows; remove the try/catch");
    expect(diags[0]!.help).toBe(
      "Drop the try/catch, or handle / wrap the error (e.g. `throw new Error('...', { cause: e })`).",
    );
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.category).toBe("Error Handling");
  });

  it("reports the diagnostic at the catch-clause start", () => {
    // `try { f(); } ` is 13 chars; `catch` begins at 0-based char 13 ⇒ column 14.
    const diags = runRule(rule, "try { f(); } catch (e) { throw e; }\n");
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(14);
  });

  it("does NOT flag rethrowing a DIFFERENT identifier than the binding", () => {
    expect(
      runRule(rule, "try { f(); } catch (e) { throw other; }\n"),
    ).toHaveLength(0);
  });

  it("does NOT flag a catch with no binding", () => {
    expect(runRule(rule, "try { f(); } catch { throw err; }\n")).toHaveLength(0);
  });
});

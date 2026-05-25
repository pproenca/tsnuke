import { describe, expect, it } from "vitest";
import { runRule } from "@tsnuke/rules-core-effect";
import { rule } from "../main/no-empty-catch.js";

describe("no-empty-catch (SYN)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

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

  // --- Added edge cases (predicate logic + position/message/severity/rule-id) ---

  it("carries the verbatim message/help + meta + rule-id in the diagnostic", () => {
    const diags = runRule(rule, "try { f(); } catch (e) {}\n");
    expect(diags[0]!.rule).toBe("no-empty-catch");
    expect(diags[0]!.message).toBe(
      "Empty catch block silently swallows the error.",
    );
    expect(diags[0]!.help).toBe(
      "Handle, log, or rethrow — or add a comment explaining the intentional swallow.",
    );
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.category).toBe("Error Handling");
    expect(diags[0]!.tier).toBe("SYN");
    expect(diags[0]!.plugin).toBe("tsnuke");
  });

  it("reports 1-based line/column at the catch-clause start", () => {
    // `try { f(); } ` is 13 chars; `catch` begins at 0-based char 13 ⇒ column 14.
    const diags = runRule(rule, "try { f(); } catch (e) {}\n");
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(14);
  });

  it("flags an empty catch with no binding (`catch {}`)", () => {
    expect(runRule(rule, "try { f(); } catch {}\n")).toHaveLength(1);
  });

  it("does NOT flag a catch with a single non-empty statement", () => {
    expect(runRule(rule, "try { f(); } catch (e) { handle(); }\n")).toHaveLength(
      0,
    );
  });
});

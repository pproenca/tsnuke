import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/prefer-error-instantiation.js";

describe("prefer-error-instantiation (SYN)", () => {
  // --- Ported verbatim from the legacy characterization spec ---

  it("flags `throw Error('x')` (missing `new`)", () => {
    const diags = runRule(rule, "function f() { throw Error('x'); }\n");
    expect(diags).toHaveLength(1);
    expect(diags[0]!.rule).toBe("prefer-error-instantiation");
  });

  it("flags a `*Error` subclass called without `new`", () => {
    expect(
      runRule(rule, "function f() { throw TypeError('bad'); }\n"),
    ).toHaveLength(1);
  });

  it("allows `throw new Error('x')`", () => {
    expect(runRule(rule, "function f() { throw new Error('x'); }\n")).toHaveLength(
      0,
    );
  });

  it("does not flag an unrelated function call", () => {
    expect(
      runRule(
        rule,
        "function format(s: string) { return s; }\nconst x = format('a');\n",
      ),
    ).toHaveLength(0);
  });

  it("does not flag a short name merely containing 'Error'", () => {
    // `Error` itself fires, but a 5-char non-`Error` name like `Erro` should not.
    expect(runRule(rule, "function Erro() {}\nconst x = Erro();\n")).toHaveLength(
      0,
    );
  });

  // --- RULE-026: broken auto-fix — declares auto-fix but emits NO fix payload ---

  it("declares `fixKind: auto-fix` in its meta (RULE-026)", () => {
    expect(rule.fixKind).toBe("auto-fix");
  });

  it("RULE-026: the emitted diagnostic carries NO `fix` payload", () => {
    const diags = runRule(rule, "function f() { throw Error('x'); }\n");
    expect(diags).toHaveLength(1);
    // The rule advertises `auto-fix` yet attaches no edit — `--fix` is a silent
    // no-op. Preserved verbatim from legacy; assert `fix` is ABSENT (not present
    // and not `undefined`-keyed, per exactOptionalPropertyTypes shaping).
    expect(diags[0]!.fix).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(diags[0]!, "fix")).toBe(false);
  });

  // --- RULE-017: the `*Error` name heuristic boundary ---
  // isErrorCtorName(name) = name === "Error" || (name.length > 5 && endsWith("Error"))

  it("RULE-017: bare `Error` is flagged (the `=== \"Error\"` branch)", () => {
    expect(runRule(rule, "const x = Error('x');\n")).toHaveLength(1);
  });

  it("RULE-017: a >5-char `*Error` name is treated as an error ctor (e.g. `HttpError`)", () => {
    // `HttpError` = 9 chars, ends with `Error` ⇒ flagged.
    expect(runRule(rule, "const x = HttpError('boom');\n")).toHaveLength(1);
  });

  it("RULE-017: a 6-char `*Error` name (`AbError`-style boundary) is flagged when >5", () => {
    // `XxError` = 7 chars > 5 and endsWith("Error") ⇒ flagged.
    expect(runRule(rule, "const x = XxError('boom');\n")).toHaveLength(1);
  });

  it("RULE-017: a short non-`Error` name (<6 chars) is NOT flagged", () => {
    // `Error` is exactly 5 chars: the suffix branch needs length>5, so only the
    // bare-`Error` literal branch catches it. A 5-char `Erro` matches neither.
    expect(runRule(rule, "const x = Erro();\n")).toHaveLength(0);
  });

  it("RULE-017: an exactly-5-char string ending in `Error` is NOT flagged via the suffix branch", () => {
    // The only 5-char string ending in "Error" IS "Error" itself (caught by the
    // literal branch). A different 5-char name like `Error`-suffixed cannot exist
    // shorter; confirm a non-Error 5-char ctor name is not flagged.
    expect(runRule(rule, "const x = Range();\n")).toHaveLength(0);
  });

  it("does NOT flag a property-access callee (`new` is about bare-identifier ctors only)", () => {
    // `obj.Error(...)` is a method call, not a bare identifier callee — not flagged.
    expect(runRule(rule, "const x = obj.Error('x');\n")).toHaveLength(0);
  });

  it("carries the verbatim message/help + name interpolation + position", () => {
    const diags = runRule(rule, "function f() { throw Error('x'); }\n");
    expect(diags[0]!.message).toBe(
      "Call `new Error(...)` instead of `Error(...)` to construct an error.",
    );
    expect(diags[0]!.help).toBe(
      "Prefix the error constructor with `new`. User-defined error subclasses require `new`, and it reads as constructing an exception.",
    );
    expect(diags[0]!.severity).toBe("warning");
    expect(diags[0]!.category).toBe("Error Handling");
    expect(diags[0]!.tier).toBe("SYN");
    // `function f() { throw ` is 21 chars; `Error` callee begins at 0-based char
    // 21 ⇒ 1-based column 22 (the CallExpression starts at the bare identifier).
    expect(diags[0]!.line).toBe(1);
    expect(diags[0]!.column).toBe(22);
  });
});

import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

/**
 * SYN — flag instantiating an error WITHOUT `new`: `throw Error('x')` /
 * `Promise.reject(TypeError('x'))`. Google TS Style Guide: "Always use
 * `new Error()` when instantiating exceptions, instead of just calling
 * `Error()`."
 *
 * While built-in `Error(...)` happens to work without `new`, calling an error
 * constructor as a plain function is inconsistent, doesn't extend to user error
 * subclasses (which throw if called without `new`), and reads as if a value were
 * being computed rather than an exception constructed.
 *
 * Distinct from `only-throw-error` (TYP), which flags throwing a non-Error VALUE.
 * This is purely about the missing `new` on a call to an error constructor.
 *
 * Conservative: matches a bare identifier callee named `Error` or ending in
 * `Error` (e.g. `TypeError`, `RangeError`, `HttpError`) — the well-established
 * naming convention for error types — to keep false positives near zero.
 *
 * RULE-026 (preserved VERBATIM): this rule declares `fixKind: "auto-fix"` in its
 * meta but attaches NO `fix` payload to its diagnostic, so `--fix` is a silent
 * no-op for it. This is a confirmed legacy defect carried forward unchanged — the
 * fix (emit a payload, or downgrade `fixKind` to `manual`/`codemod`) is deferred
 * to an SME decision. See TRANSFORMATION_NOTES.md follow-ups.
 *
 * RULE-017 (preserved VERBATIM): the `*Error` name heuristic — `name === "Error"`
 * OR (`name.length > 5` AND `name.endsWith("Error")`).
 */

/** True if `name` is `Error` or a conventional `*Error` constructor name. */
function isErrorCtorName(name: string): boolean {
  return name === "Error" || (name.length > 5 && name.endsWith("Error"));
}

export const rule = defineRule(
  {
    id: "prefer-error-instantiation",
    severity: "warning",
    category: "Error Handling",
    tier: "SYN",
    fixKind: "auto-fix",
    tags: ["convention"],
    recommendation:
      "Use `new` when constructing an error: write `throw new Error('msg')`, not `throw Error('msg')`. User-defined error subclasses throw if called without `new`, and `new` reads as constructing an exception rather than computing a value.",
  },
  () => ({
    [ts.SyntaxKind.CallExpression]: (node, ctx) => {
      if (!ts.isCallExpression(node)) return;
      // Only a bare identifier callee, e.g. `Error(...)` / `TypeError(...)`.
      if (!ts.isIdentifier(node.expression)) return;
      const name = node.expression.text;
      if (!isErrorCtorName(name)) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Call \`new ${name}(...)\` instead of \`${name}(...)\` to construct an error.`,
        help: "Prefix the error constructor with `new`. User-defined error subclasses require `new`, and it reads as constructing an exception.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

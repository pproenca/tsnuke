import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

/**
 * SYN — flag the `JSON.parse(JSON.stringify(x))` deep-clone idiom.
 *
 * Serializing then re-parsing to deep-clone is "AI-slop": it silently drops
 * `Date`s (→ strings), `Map`/`Set`, `undefined`, functions, and class
 * prototypes, throws on cyclic data, and is far slower than the native
 * `structuredClone()`.
 */

/**
 * True when `expr` is a call `JSON.<member>(...)` (callee is a property access
 * on the `JSON` identifier whose member name is `member`).
 */
function isJsonCall(expr: ts.Expression, member: string): boolean {
  if (!ts.isCallExpression(expr)) return false;
  const callee = expr.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (!ts.isIdentifier(callee.expression)) return false;
  return callee.expression.text === "JSON" && callee.name.text === member;
}

export const rule = defineRule(
  {
    id: "no-json-parse-stringify-clone",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "codemod",
    tags: ["ts-idiom"],
    recommendation:
      "Deep-cloning via `JSON.parse(JSON.stringify(x))` loses Dates/Maps/Sets/undefined/functions and is slow — use `structuredClone()` instead.",
  },
  () => ({
    [ts.SyntaxKind.CallExpression]: (node, ctx) => {
      if (!ts.isCallExpression(node)) return;
      // Outer must be `JSON.parse(...)`.
      if (!isJsonCall(node, "parse")) return;
      // Its first argument must itself be `JSON.stringify(...)`.
      const arg = node.arguments[0];
      if (arg === undefined) return;
      if (!isJsonCall(arg, "stringify")) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "deep clone via JSON round-trip loses Dates/Maps/undefined and is slow; use `structuredClone()`",
        help: "Replace `JSON.parse(JSON.stringify(x))` with `structuredClone(x)`.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

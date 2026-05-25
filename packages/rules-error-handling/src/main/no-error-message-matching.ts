import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag classifying an error by matching its MESSAGE string
 * (`/.../.test(err.message)`, `error.message.includes(...)`, etc.). Error
 * *identity* is delegated to a fragile string (messages change, get localized,
 * get reworded) instead of living in the type: typed error classes (`instanceof`)
 * or a discriminated error union. Classic in LLM/legacy error handling.
 */

const MATCH_METHODS = new Set([
  "test",
  "includes",
  "startsWith",
  "endsWith",
  "match",
  "search",
]);

/** Heuristic: does this expression look like an error/message value? */
function looksLikeErrorMessage(expr: ts.Expression): boolean {
  let e = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  // `String(x)` — unwrap and test the inner.
  if (
    ts.isCallExpression(e) &&
    ts.isIdentifier(e.expression) &&
    e.expression.text === "String" &&
    e.arguments.length > 0
  ) {
    const inner = e.arguments[0];
    return inner !== undefined && looksLikeErrorMessage(inner);
  }
  // `x.message` / `err?.message`
  if (ts.isPropertyAccessExpression(e) && e.name.text === "message") return true;
  // an identifier named like an error/message
  if (ts.isIdentifier(e)) return /(^e$)|err|error|message|msg/i.test(e.text);
  return false;
}

export const rule = defineRule(
  {
    id: "no-error-message-matching",
    severity: "warning",
    category: "Error Handling",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Don't branch on an error's message text — it's fragile (messages change/localize). Use typed error classes (`instanceof MyError`) or a discriminated error union with a stable `code` field.",
  },
  () => ({
    [ts.SyntaxKind.CallExpression]: (node, ctx) => {
      if (!ts.isCallExpression(node)) return;
      const callee = node.expression;
      if (!ts.isPropertyAccessExpression(callee)) return;
      if (!MATCH_METHODS.has(callee.name.text)) return;

      // Candidates: the receiver (e.g. message.includes / regex.test) + the args.
      const candidates: ts.Expression[] = [callee.expression, ...node.arguments];
      if (!candidates.some(looksLikeErrorMessage)) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Classifying an error by matching its message string is fragile. Use typed errors (`instanceof`) or a discriminated error code.",
        help: "Give errors a stable identity (subclass or a `code` discriminant) and branch on that, not on the human-readable message.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

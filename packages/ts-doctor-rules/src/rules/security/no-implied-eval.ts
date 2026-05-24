import ts from "typescript";
import { defineRule } from "../../define-rule.js";

const TIMER_NAMES = new Set(["setTimeout", "setInterval"]);

/** True when the callee resolves to a bare or member call ending in a timer name. */
function isTimerCallee(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) return TIMER_NAMES.has(expression.text);
  if (ts.isPropertyAccessExpression(expression)) {
    return TIMER_NAMES.has(expression.name.text);
  }
  return false;
}

/** True when `arg` is a string literal or a template (the implied-eval payload). */
function isStringArgument(arg: ts.Expression): boolean {
  return (
    ts.isStringLiteral(arg) ||
    ts.isNoSubstitutionTemplateLiteral(arg) ||
    ts.isTemplateExpression(arg)
  );
}

/**
 * SYN — flag `setTimeout`/`setInterval` (bare or member, e.g.
 * `window.setTimeout`) called with a string first argument. The string is
 * `eval`'d in the global scope at fire time — an implied eval. AST-only.
 */
export const rule = defineRule(
  {
    id: "no-implied-eval",
    severity: "error",
    category: "Security",
    tier: "SYN",
    fixKind: "manual",
    tags: ["security"],
    recommendation:
      "Pass a function (arrow or reference) to `setTimeout`/`setInterval`, never a string. A string argument is evaluated like `eval`.",
  },
  () => ({
    [ts.SyntaxKind.CallExpression]: (node, ctx) => {
      if (!ts.isCallExpression(node)) return;
      if (!isTimerCallee(node.expression)) return;
      const first = node.arguments[0];
      if (first === undefined || !isStringArgument(first)) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "string-argument setTimeout/setInterval is an implied eval",
        help: "Pass a function instead of a string, e.g. `setTimeout(() => doStuff(), 100)`.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

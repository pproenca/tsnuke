import ts from "typescript";
import { defineRule } from "../../define-rule.js";
import type { RuleContext } from "../../define-rule.js";

/**
 * SYN — a function that checks a type at runtime (`typeof` / `instanceof`) and
 * returns `boolean` throws away the narrowing it computed: every caller must
 * re-guard. Declaring it a **type predicate** (`param is T`) moves that
 * responsibility into the type system, where it belongs — the canonical
 * "narrowing delegated outside where it should live" anti-pattern.
 *
 * Conservative: only flags functions with an explicit `: boolean` return type
 * (so it isn't already a predicate) whose body is a single guard expression.
 */

/** Unwrap parentheses. */
function unwrap(e: ts.Expression): ts.Expression {
  let cur = e;
  while (ts.isParenthesizedExpression(cur)) cur = cur.expression;
  return cur;
}

/** True iff `expr` is a type-guard shape: typeof/instanceof, or &&/||/! of guards. */
function isGuardExpression(expr: ts.Expression): boolean {
  const e = unwrap(expr);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
    return isGuardExpression(e.operand);
  }
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (
      op === ts.SyntaxKind.AmpersandAmpersandToken ||
      op === ts.SyntaxKind.BarBarToken
    ) {
      return isGuardExpression(e.left) && isGuardExpression(e.right);
    }
    if (op === ts.SyntaxKind.InstanceOfKeyword) return true;
    const isEqNeq =
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken;
    if (isEqNeq) {
      return ts.isTypeOfExpression(unwrap(e.left)) || ts.isTypeOfExpression(unwrap(e.right));
    }
  }
  return false;
}

export const rule = defineRule(
  {
    id: "prefer-type-guard-predicate",
    severity: "warning",
    category: "Type Safety",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom", "type-guard"],
    recommendation:
      "Declare a type predicate (`param is T`) instead of returning `boolean`. A bare boolean discards the narrowing, forcing every caller to re-check at runtime — push the responsibility into the type.",
  },
  () => {
    const check = (node: ts.Node, ctx: RuleContext): void => {
      const fn = node as ts.FunctionLikeDeclaration;
      // Must have an explicit `: boolean` return type (so it's not already a
      // predicate, and the author committed to a boolean contract).
      if (fn.type === undefined || fn.type.kind !== ts.SyntaxKind.BooleanKeyword) return;
      const body = fn.body;
      if (body === undefined) return;

      let guard: ts.Expression | undefined;
      if (ts.isBlock(body)) {
        if (body.statements.length !== 1) return;
        const stmt = body.statements[0];
        if (stmt === undefined || !ts.isReturnStatement(stmt) || stmt.expression === undefined) {
          return;
        }
        guard = stmt.expression;
      } else {
        guard = body; // concise arrow body
      }
      if (!isGuardExpression(guard)) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Type-guard function returns `boolean`, discarding its narrowing. Declare a type predicate (`param is T`).",
        help: "Change the return type from `boolean` to `param is T` so callers narrow automatically instead of re-checking.",
        line: line + 1,
        column: character + 1,
      });
    };
    return {
      [ts.SyntaxKind.FunctionDeclaration]: check,
      [ts.SyntaxKind.FunctionExpression]: check,
      [ts.SyntaxKind.ArrowFunction]: check,
      [ts.SyntaxKind.MethodDeclaration]: check,
    };
  },
);

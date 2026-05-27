import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag the canonical imperative groupBy loop: a `for`/`for-of` whose body
 * is exactly two statements:
 *
 *   1. A "missing-key" condition + assignment: any of
 *        if (!X[k]) X[k] = [];
 *        if (X[k] === undefined) X[k] = [];
 *        if (X[k] == null)       X[k] = [];
 *        if (!(k in X))          X[k] = [];
 *   2. `X[k].push(item);`  (also accepts `X[k]!.push(...)`)
 *
 * Same identifier `X` and same key expression `k` in both. This is the shape
 * an LLM defaults to when it should write `Object.groupBy(xs, x => x.k)` (or
 * `Map.groupBy` for non-string keys, TS 5.4+ / Node 21+).
 *
 * Strict MULTI-statement shape: the single-statement `(X[k] ??= []).push(item)`
 * variant is already covered (less specifically) by `prefer-array-methods`.
 */
export const rule = defineRule(
  {
    id: "prefer-group-by-over-imperative-groups",
    severity: "warning",
    category: "Functional Patterns",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Replace `if (!groups[k]) groups[k] = []; groups[k].push(x)` with `Object.groupBy(xs, x => k)` (TS 5.4+ / Node 21+). For non-primitive keys, use `Map.groupBy`. The fold is named, the intent is at the head of the line, and there's nothing to copy-paste wrong.",
  },
  () => ({
    [ts.SyntaxKind.ForOfStatement]: check,
    [ts.SyntaxKind.ForStatement]: check,
  }),
);

function check(node: ts.Node, ctx: RuleContext): void {
  if (!ts.isForOfStatement(node) && !ts.isForStatement(node)) return;
  const body = node.statement;
  if (!ts.isBlock(body) || body.statements.length !== 2) return;

  const [first, second] = body.statements;
  if (first === undefined || second === undefined) return;

  const init = matchGroupInitIf(first);
  if (init === undefined) return;
  if (!matchGroupPush(second, init.target, init.keyText)) return;

  const start = node.getStart(ctx.sourceFile);
  const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
  ctx.report({
    filePath: ctx.filePath,
    message: `this loop builds groups in \`${init.target}\` by hand — prefer \`Object.groupBy\` / \`Map.groupBy\`.`,
    help: "Replace `for (const x of xs) { if (!groups[k]) groups[k] = []; groups[k].push(x) }` with `Object.groupBy(xs, x => k)`.",
    line: line + 1,
    column: character + 1,
  });
}

interface GroupInit {
  readonly target: string;
  readonly keyText: string;
}

interface KeyAccess {
  readonly receiver: string;
  readonly keyText: string;
}

function matchGroupInitIf(stmt: ts.Statement): GroupInit | undefined {
  if (!ts.isIfStatement(stmt) || stmt.elseStatement !== undefined) return undefined;

  const cond = missingKeyCondition(stmt.expression);
  if (cond === undefined) return undefined;

  const thenStmt = unwrapSingle(stmt.thenStatement);
  if (!ts.isExpressionStatement(thenStmt)) return undefined;
  const assign = thenStmt.expression;
  if (!ts.isBinaryExpression(assign)) return undefined;
  if (assign.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return undefined;
  if (!ts.isElementAccessExpression(assign.left)) return undefined;
  if (!ts.isIdentifier(assign.left.expression)) return undefined;
  if (assign.left.expression.text !== cond.receiver) return undefined;
  if (assign.left.argumentExpression.getText() !== cond.keyText) return undefined;
  if (!ts.isArrayLiteralExpression(assign.right) || assign.right.elements.length !== 0) {
    return undefined;
  }

  return { target: cond.receiver, keyText: cond.keyText };
}

/**
 * Recognize a condition that's true when `X[k]` is missing from a record/map:
 *   - `!X[k]`               (truthy-check negation)
 *   - `X[k] === undefined`  /  `X[k] == undefined`  (strict/loose undefined)
 *   - `X[k] === null`       /  `X[k] == null`       (strict/loose null; `== null` also catches undefined)
 *   - `!(k in X)`           (key-existence negation)
 */
function missingKeyCondition(cond: ts.Expression): KeyAccess | undefined {
  if (ts.isPrefixUnaryExpression(cond) && cond.operator === ts.SyntaxKind.ExclamationToken) {
    const operand = ts.isParenthesizedExpression(cond.operand)
      ? cond.operand.expression
      : cond.operand;
    const access = asKeyAccess(operand);
    if (access !== undefined) return access;
    return asInExpression(operand);
  }
  if (!ts.isBinaryExpression(cond)) return undefined;
  const tk = cond.operatorToken.kind;
  if (tk !== ts.SyntaxKind.EqualsEqualsEqualsToken && tk !== ts.SyntaxKind.EqualsEqualsToken) {
    return undefined;
  }
  if (!isNullishLiteral(cond.right)) return undefined;
  return asKeyAccess(cond.left);
}

function asKeyAccess(expr: ts.Expression): KeyAccess | undefined {
  if (!ts.isElementAccessExpression(expr)) return undefined;
  if (!ts.isIdentifier(expr.expression)) return undefined;
  return { receiver: expr.expression.text, keyText: expr.argumentExpression.getText() };
}

function asInExpression(expr: ts.Expression): KeyAccess | undefined {
  if (!ts.isBinaryExpression(expr)) return undefined;
  if (expr.operatorToken.kind !== ts.SyntaxKind.InKeyword) return undefined;
  if (!ts.isIdentifier(expr.right)) return undefined;
  return { receiver: expr.right.text, keyText: expr.left.getText() };
}

function isNullishLiteral(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr) && expr.text === "undefined") return true;
  return expr.kind === ts.SyntaxKind.NullKeyword;
}

function matchGroupPush(stmt: ts.Statement, target: string, keyText: string): boolean {
  if (!ts.isExpressionStatement(stmt)) return false;
  const call = stmt.expression;
  if (!ts.isCallExpression(call)) return false;
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (callee.name.text !== "push") return false;
  const recv = unwrapNonNull(callee.expression);
  if (!ts.isElementAccessExpression(recv)) return false;
  if (!ts.isIdentifier(recv.expression) || recv.expression.text !== target) return false;
  return recv.argumentExpression.getText() === keyText;
}

function unwrapNonNull(expr: ts.Expression): ts.Expression {
  return ts.isNonNullExpression(expr) ? unwrapNonNull(expr.expression) : expr;
}

function unwrapSingle(stmt: ts.Statement): ts.Statement {
  if (!ts.isBlock(stmt) || stmt.statements.length !== 1) return stmt;
  return stmt.statements[0] ?? stmt;
}

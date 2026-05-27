import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag the canonical imperative groupBy loop: a `for`/`for-of` whose body
 * is exactly two statements:
 *
 *   1. `if (!X[k]) X[k] = [];` (or `if (X[k] === undefined) ...`)
 *   2. `X[k].push(item);`  (also accepts `X[k]!.push(...)`)
 *
 * Same identifier `X` and same key expression `k` in both. This is the shape an
 * LLM defaults to when it should write `Object.groupBy(xs, x => x.k)` (or
 * `Map.groupBy` for non-string keys, TS 5.4+ / Node 21+).
 *
 * Strict MULTI-statement shape: the `(X[k] ??= []).push(item)` single-statement
 * variant is already covered (less specifically) by `prefer-array-methods`.
 *
 * Anti-pattern catalog reference:
 *   `implementation-functional-patterns/references/stream-reduce-over-imperative-accumulation.md`
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

function matchGroupInitIf(stmt: ts.Statement): GroupInit | undefined {
  if (!ts.isIfStatement(stmt) || stmt.elseStatement !== undefined) return undefined;

  const access = missingKeyAccess(stmt.expression);
  if (access === undefined) return undefined;
  if (!ts.isIdentifier(access.expression)) return undefined;

  const thenStmt = unwrapSingle(stmt.thenStatement);
  if (!ts.isExpressionStatement(thenStmt)) return undefined;
  const assign = thenStmt.expression;
  if (!ts.isBinaryExpression(assign)) return undefined;
  if (assign.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return undefined;
  if (!ts.isElementAccessExpression(assign.left)) return undefined;
  if (!ts.isIdentifier(assign.left.expression)) return undefined;
  if (assign.left.expression.text !== access.expression.text) return undefined;
  if (assign.left.argumentExpression.getText() !== access.argumentExpression.getText()) return undefined;
  if (!ts.isArrayLiteralExpression(assign.right) || assign.right.elements.length !== 0) {
    return undefined;
  }

  return {
    target: access.expression.text,
    keyText: access.argumentExpression.getText(),
  };
}

/**
 * Match a condition that's true when `X[k]` is missing from a record/map: either
 * `!X[k]` or `X[k] === undefined` / `X[k] == undefined`. Returns the underlying
 * `X[k]` access, or `undefined` if the condition doesn't match.
 */
function missingKeyAccess(cond: ts.Expression): ts.ElementAccessExpression | undefined {
  if (ts.isPrefixUnaryExpression(cond) && cond.operator === ts.SyntaxKind.ExclamationToken) {
    return ts.isElementAccessExpression(cond.operand) ? cond.operand : undefined;
  }
  if (!ts.isBinaryExpression(cond)) return undefined;
  const tk = cond.operatorToken.kind;
  if (tk !== ts.SyntaxKind.EqualsEqualsEqualsToken && tk !== ts.SyntaxKind.EqualsEqualsToken) {
    return undefined;
  }
  if (
    ts.isElementAccessExpression(cond.left) &&
    ts.isIdentifier(cond.right) &&
    cond.right.text === "undefined"
  ) {
    return cond.left;
  }
  return undefined;
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

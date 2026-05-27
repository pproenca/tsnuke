import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";

/** `+= -= *=` only — logical/nullish/string-concat compound assignments are
 *  excluded by construction (logical short-circuit doesn't fold; `concat` and
 *  string `+=` are their own caught-elsewhere shapes). */
const FOLD_OPS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
]);

/**
 * SYN — flag the imperative scalar-accumulator loop: `for (const x of xs) total
 * += x.amount`. `xs.reduce((s, x) => s + x.amount, 0)` names the fold at the
 * head of the line.
 *
 * Detection (conservative):
 *   - `for`/`for-of` (NOT `for-await-of` — `Array.prototype.reduce` can't drain
 *     async iterables, so the suggested replacement wouldn't apply).
 *   - Body (unwrapped from a 1-statement block) is exactly `IDENT <op>= EXPR;`
 *     with `<op>` in {`+`, `-`, `*`}.
 *   - The accumulator must be a bare identifier — the `acc[k] += x` shape is the
 *     histogram/groupBy family, handled by `prefer-group-by-over-imperative-groups`.
 *
 * Anti-pattern catalog reference:
 *   `implementation-functional-patterns/references/stream-reduce-over-imperative-accumulation.md`
 */
export const rule = defineRule(
  {
    id: "prefer-reduce-over-imperative-sum",
    severity: "warning",
    category: "Functional Patterns",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Replace `let total = 0; for (const x of xs) total += f(x)` with `const total = xs.reduce((s, x) => s + f(x), 0)`. The reduce form names the fold at the head of the line; the imperative form hides the intent in the loop body. Keep the loop when the body has real side effects, when you must `break` early, or in a measured hot path.",
  },
  () => ({
    [ts.SyntaxKind.ForOfStatement]: check,
    [ts.SyntaxKind.ForStatement]: check,
  }),
);

function check(node: ts.Node, ctx: RuleContext): void {
  if (ts.isForOfStatement(node) && node.awaitModifier !== undefined) return;
  if (!ts.isForOfStatement(node) && !ts.isForStatement(node)) return;

  const body = unwrapSingle(node.statement);
  if (!ts.isExpressionStatement(body)) return;
  const expr = body.expression;
  if (!ts.isBinaryExpression(expr)) return;
  if (!FOLD_OPS.has(expr.operatorToken.kind)) return;
  if (!ts.isIdentifier(expr.left)) return;

  const start = node.getStart(ctx.sourceFile);
  const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
  ctx.report({
    filePath: ctx.filePath,
    message: `this loop folds into \`${expr.left.text}\` with \`${expr.operatorToken.getText(ctx.sourceFile)}\` — prefer \`.reduce(...)\` to name the fold.`,
    help: "Replace `for (const x of xs) total += f(x)` with `xs.reduce((s, x) => s + f(x), 0)`.",
    line: line + 1,
    column: character + 1,
  });
}

function unwrapSingle(stmt: ts.Statement): ts.Statement {
  if (!ts.isBlock(stmt) || stmt.statements.length !== 1) return stmt;
  return stmt.statements[0] ?? stmt;
}

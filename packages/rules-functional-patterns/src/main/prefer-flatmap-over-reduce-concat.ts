import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag the `arr.reduce((acc, x) => acc.concat(f(x)), [])` O(n²) trap. Each
 * `concat` step allocates a fresh array, so the cumulative cost is quadratic in
 * the input length. `arr.flatMap(f)` is the same one-to-many transform with a
 * single allocation and linear time.
 *
 * Detection (crisp):
 *   - A call expression `<receiver>.reduce(<arrow>, <emptyArrayLiteral>)`.
 *   - The arrow has ≥1 parameter; its body returns `<param0>.concat(...)`
 *     (either expression-bodied `(a, x) => a.concat(...)` or block-bodied
 *     `(a, x) => { return a.concat(...) }`).
 *
 * Anti-pattern catalog reference:
 *   `implementation-functional-patterns/references/stream-reduce-over-imperative-accumulation.md`
 *   (the "reduce-with-concat is the bait" pitfall).
 */
export const rule = defineRule(
  {
    id: "prefer-flatmap-over-reduce-concat",
    severity: "warning",
    category: "Functional Patterns",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "`arr.reduce((acc, x) => acc.concat(f(x)), [])` is O(n²) — each `concat` allocates a new array. Use `arr.flatMap(f)` for the same one-to-many transform in O(n) time with a single output allocation.",
  },
  () => ({
    [ts.SyntaxKind.CallExpression]: (node, ctx) => {
      if (!ts.isCallExpression(node)) return;
      const callee = node.expression;
      if (!ts.isPropertyAccessExpression(callee)) return;
      if (callee.name.text !== "reduce") return;
      if (node.arguments.length !== 2) return;

      const [arrow, init] = node.arguments;
      if (arrow === undefined || init === undefined) return;
      if (!ts.isArrowFunction(arrow) && !ts.isFunctionExpression(arrow)) return;
      if (arrow.parameters.length < 1) return;
      const accParam = arrow.parameters[0]!;
      if (!ts.isIdentifier(accParam.name)) return;
      const accName = accParam.name.text;

      if (!isEmptyArrayLiteral(init)) return;
      if (!arrowReturnsConcat(arrow.body, accName)) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "`reduce((acc, x) => acc.concat(...), [])` is quadratic — prefer `.flatMap(...)`.",
        help: "Replace `xs.reduce((acc, x) => acc.concat(f(x)), [])` with `xs.flatMap(f)`.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

function isEmptyArrayLiteral(node: ts.Expression): boolean {
  return ts.isArrayLiteralExpression(node) && node.elements.length === 0;
}

function arrowReturnsConcat(body: ts.ConciseBody, accName: string): boolean {
  if (ts.isBlock(body)) {
    const last = body.statements[body.statements.length - 1];
    if (last === undefined || !ts.isReturnStatement(last)) return false;
    return last.expression !== undefined && isConcatCallOn(last.expression, accName);
  }
  return isConcatCallOn(body, accName);
}

function isConcatCallOn(expr: ts.Expression, accName: string): boolean {
  if (!ts.isCallExpression(expr)) return false;
  const callee = expr.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (callee.name.text !== "concat") return false;
  return ts.isIdentifier(callee.expression) && callee.expression.text === accName;
}

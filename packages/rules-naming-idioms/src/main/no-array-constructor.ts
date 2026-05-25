import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag the `Array(...)` constructor (with or without `new`). Google TS
 * Style Guide: "Do not use the `Array()` constructor … always use bracket
 * notation to initialize arrays, or `from` to initialize an `Array` with a
 * certain size."
 *
 * `Array(...)` is a footgun: `Array(2, 3)` is `[2, 3]` but `Array(3)` is a
 * length-3 sparse array — the meaning silently flips on argument count. We only
 * allow the single numeric-literal length form (`Array(5)` / `new Array(5)`),
 * which is unambiguous; everything else (0 args, ≥2 args, or a single non-numeric
 * arg) should be a `[]` literal.
 */

/** True if the sole argument is a numeric literal (the unambiguous length form). */
function isSingleNumericLength(
  args: readonly ts.Expression[],
): boolean {
  if (args.length !== 1) return false;
  const a = args[0]!;
  if (ts.isNumericLiteral(a)) return true;
  // `Array(-5)` / `Array(+5)` — a unary numeric literal is still a length-ish form.
  return (
    ts.isPrefixUnaryExpression(a) &&
    (a.operator === ts.SyntaxKind.MinusToken ||
      a.operator === ts.SyntaxKind.PlusToken) &&
    ts.isNumericLiteral(a.operand)
  );
}

function check(
  node: ts.CallExpression | ts.NewExpression,
  ctx: RuleContext,
): void {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "Array") {
    return;
  }
  // `new Array` with no parens has undefined arguments; treat as zero args.
  const args: readonly ts.Expression[] = node.arguments ?? [];
  if (isSingleNumericLength(args)) return; // allowed length form

  const start = node.getStart(ctx.sourceFile);
  const { line, character } =
    ctx.sourceFile.getLineAndCharacterOfPosition(start);
  ctx.report({
    filePath: ctx.filePath,
    message: "Do not use the `Array(...)` constructor; use an array literal.",
    help: "Use `[]` / `[a, b]` to build arrays, or `Array.from({ length: n })` for a sized array. `Array(...)`'s meaning flips on argument count.",
    line: line + 1,
    column: character + 1,
  });
}

export const rule = defineRule(
  {
    id: "no-array-constructor",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "codemod",
    tags: ["convention"],
    recommendation:
      "Replace `Array(...)` / `new Array(...)` with an array literal `[]`. The constructor is ambiguous: `Array(2, 3)` is `[2, 3]` but `Array(3)` is an empty length-3 array. Use `Array.from({ length: n })` for a sized array.",
  },
  () => ({
    [ts.SyntaxKind.CallExpression]: (node, ctx) => {
      if (!ts.isCallExpression(node)) return;
      check(node, ctx);
    },
    [ts.SyntaxKind.NewExpression]: (node, ctx) => {
      if (!ts.isNewExpression(node)) return;
      check(node, ctx);
    },
  }),
);

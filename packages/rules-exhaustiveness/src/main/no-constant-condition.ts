import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";

/** True iff `node` is a literal whose truthiness is fixed at author time. */
function isConstantConditionLiteral(node: ts.Node): boolean {
  switch (node.kind) {
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return true;
    default:
      return false;
  }
}

/**
 * SYN — an `if` statement or conditional (ternary) whose condition is a literal
 * is a constant condition: the branch is always taken or never taken, which is
 * almost always a mistake (leftover debug flag, typo, dead code). `while`/`for`
 * loops are intentionally NOT flagged — `while (true)` is a legitimate idiom.
 */
export const rule = defineRule(
  {
    id: "no-constant-condition",
    severity: "warning",
    category: "Exhaustiveness & Narrowing",
    tier: "SYN",
    fixKind: "manual",
    tags: ["correctness"],
    recommendation:
      "Replace the literal condition with the real predicate, or delete the dead branch. (`while (true)` loops are exempt — they're a deliberate idiom.)",
  },
  () => {
    const report = (node: ts.Node, ctx: RuleContext): void => {
      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "constant condition: this branch is always taken or never taken",
        help: "Use a real predicate, or remove the unreachable branch.",
        line: line + 1,
        column: character + 1,
      });
    };
    return {
      [ts.SyntaxKind.IfStatement]: (node, ctx) => {
        if (!ts.isIfStatement(node)) return;
        if (isConstantConditionLiteral(node.expression)) report(node.expression, ctx);
      },
      [ts.SyntaxKind.ConditionalExpression]: (node, ctx) => {
        if (!ts.isConditionalExpression(node)) return;
        if (isConstantConditionLiteral(node.condition)) report(node.condition, ctx);
      },
    };
  },
);

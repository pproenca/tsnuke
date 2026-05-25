import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

/**
 * SYN — flag `<runtime check> ? (value as T) : …` where the SAME value that was
 * checked is then `as`-cast in a branch. The cast exists because the check
 * didn't narrow the type (e.g. checking one property, or a non-narrowing helper
 * like `Number.isInteger`). The narrowing responsibility was delegated to a
 * hand-written assertion. Use a type predicate (`value is T`) or structural
 * narrowing (`'k' in value`, `instanceof`) so the `as` disappears.
 */

function unwrap(e: ts.Expression): ts.Expression {
  let cur = e;
  while (ts.isParenthesizedExpression(cur)) cur = cur.expression;
  return cur;
}

/** Does the condition contain a *type* check (typeof / instanceof / in / Array.isArray)? */
function hasTypeCheck(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isTypeOfExpression(n)) {
      found = true;
      return;
    }
    if (
      ts.isBinaryExpression(n) &&
      (n.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword ||
        n.operatorToken.kind === ts.SyntaxKind.InKeyword)
    ) {
      found = true;
      return;
    }
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "isArray" &&
      ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === "Array"
    ) {
      found = true;
      return;
    }
    n.forEachChild(visit);
  };
  visit(node);
  return found;
}

/** Collect identifier names appearing in a subtree. */
function identifiersIn(node: ts.Node, out: Set<string>): void {
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) out.add(n.text);
    n.forEachChild(visit);
  };
  visit(node);
}

export const rule = defineRule(
  {
    id: "no-cast-after-guard",
    severity: "warning",
    category: "Type Assertions & Escapes",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom", "type-guard"],
    recommendation:
      "Casting a value immediately after checking it means the check didn't narrow. Write a type predicate (`value is T`) or narrow structurally (`'key' in value`, `instanceof`) so the assertion becomes unnecessary.",
  },
  () => ({
    [ts.SyntaxKind.ConditionalExpression]: (node, ctx) => {
      if (!ts.isConditionalExpression(node)) return;
      if (!hasTypeCheck(node.condition)) return;

      const condIds = new Set<string>();
      identifiersIn(node.condition, condIds);

      for (const branch of [node.whenTrue, node.whenFalse]) {
        const b = unwrap(branch);
        if (!ts.isAsExpression(b)) continue;
        const operand = unwrap(b.expression);
        if (ts.isIdentifier(operand) && condIds.has(operand.text)) {
          const start = b.getStart(ctx.sourceFile);
          const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
          ctx.report({
            filePath: ctx.filePath,
            message:
              "Casting a value right after a runtime check — the check didn't narrow it. Use a type predicate or structural narrowing instead of `as`.",
            help: "Replace the guard with a `value is T` predicate (or `in`/`instanceof`) so the compiler narrows and the `as` is unnecessary.",
            line: line + 1,
            column: character + 1,
          });
          return; // one report per conditional is enough.
        }
      }
    },
  }),
);

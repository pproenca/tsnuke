import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";
import type { RuleContext } from "@ts-doctor/rules-core-effect";

/**
 * SYN — flag a loop whose only job is to build an array via `.push()`.
 *
 * "AI-slop" TypeScript often delegates a transformation/filter to an imperative
 * `for` loop that just pushes into an accumulator — work that native array
 * methods (`.map` / `.filter` / `.flatMap` / `.reduce`) express declaratively.
 *
 * A loop matches when its (single-statement) body is either:
 *   (a) `acc.push(...)`; or
 *   (b) an `if` with no `else` whose then-branch is just `acc.push(...)`.
 */

/**
 * True when `stmt` is an `ExpressionStatement` wrapping a `something.push(...)`
 * call (the callee is a property access whose name is `push`).
 */
function isPushStatement(stmt: ts.Statement): boolean {
  if (!ts.isExpressionStatement(stmt)) return false;
  const expr = stmt.expression;
  if (!ts.isCallExpression(expr)) return false;
  const callee = expr.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  return callee.name.text === "push";
}

/**
 * Reduce a statement to its meaningful inner statement: a `Block` wrapping
 * exactly one statement unwraps to that statement; anything else is itself.
 */
function unwrapSingle(stmt: ts.Statement): ts.Statement {
  if (ts.isBlock(stmt) && stmt.statements.length === 1) {
    const inner = stmt.statements[0];
    if (inner !== undefined) return inner;
  }
  return stmt;
}

export const rule = defineRule(
  {
    id: "prefer-array-methods",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "codemod",
    tags: ["ts-idiom"],
    recommendation:
      "A loop that only `.push()`es into an accumulator is a transformation in disguise — prefer `.map()` / `.filter()` / `.flatMap()` / `.reduce()` for intent-revealing, native idioms.",
  },
  () => {
    const check = (node: ts.IterationStatement, ctx: RuleContext): void => {
      const stmt = unwrapSingle(node.statement);

      let matches = false;
      if (isPushStatement(stmt)) {
        // (a) the body is a bare `acc.push(...)`.
        matches = true;
      } else if (ts.isIfStatement(stmt) && stmt.elseStatement === undefined) {
        // (b) an `if` with no `else` whose then-branch is just `acc.push(...)`.
        const then = unwrapSingle(stmt.thenStatement);
        if (isPushStatement(then)) matches = true;
      }

      if (!matches) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "this loop only builds an array; prefer `.map()` / `.filter()` / `.flatMap()` / `.reduce()`",
        help: "Replace the imperative push-loop with a native array method.",
        line: line + 1,
        column: character + 1,
      });
    };

    return {
      [ts.SyntaxKind.ForOfStatement]: (node, ctx) => {
        if (!ts.isForOfStatement(node)) return;
        check(node, ctx);
      },
      [ts.SyntaxKind.ForStatement]: (node, ctx) => {
        if (!ts.isForStatement(node)) return;
        check(node, ctx);
      },
    };
  },
);

import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag manual type-discrimination: a chain of `typeof`/`instanceof` checks
 * on the SAME value (an if/else-if chain, or `switch (typeof x)`). That pattern
 * scatters "which variant is this?" across runtime checks; the responsibility
 * belongs in the type — model the value as a **discriminated union** (a `kind`
 * tag) and `switch` on the discriminant, which the compiler can then check for
 * exhaustiveness.
 *
 * Conservative: the if-chain form fires only when ALL arms are type-tests on the
 * same discriminant (≥2 arms), so mixed business-logic chains are left alone.
 */

function unwrap(e: ts.Expression): ts.Expression {
  let cur = e;
  while (ts.isParenthesizedExpression(cur)) cur = cur.expression;
  return cur;
}

/** If `cond` is `typeof E === "..."` or `E instanceof C`, return E's source text; else null. */
function typeTestDiscriminant(cond: ts.Expression, sf: ts.SourceFile): string | null {
  const e = unwrap(cond);
  if (!ts.isBinaryExpression(e)) return null;
  const op = e.operatorToken.kind;
  if (op === ts.SyntaxKind.InstanceOfKeyword) return unwrap(e.left).getText(sf);
  const isEqNeq =
    op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    op === ts.SyntaxKind.EqualsEqualsToken ||
    op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    op === ts.SyntaxKind.ExclamationEqualsToken;
  if (isEqNeq) {
    const l = unwrap(e.left);
    const r = unwrap(e.right);
    if (ts.isTypeOfExpression(l)) return l.expression.getText(sf);
    if (ts.isTypeOfExpression(r)) return r.expression.getText(sf);
  }
  return null;
}

export const rule = defineRule(
  {
    id: "prefer-discriminated-union",
    severity: "warning",
    category: "Exhaustiveness & Narrowing",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom", "type-guard"],
    recommendation:
      "Replace the repeated `typeof`/`instanceof` discrimination with a discriminated union: give each variant a literal `kind`/`type` tag and `switch` on it. The compiler then enforces exhaustiveness, and callers narrow for free.",
  },
  () => {
    const report = (node: ts.Node, ctx: RuleContext): void => {
      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Manual type-discrimination by `typeof`/`instanceof`. Model this as a discriminated union and `switch` on a `kind` tag.",
        help: "A discriminated union moves variant selection into the type system and gives you compiler-checked exhaustiveness.",
        line: line + 1,
        column: character + 1,
      });
    };

    return {
      // `switch (typeof x) { ... }`
      [ts.SyntaxKind.SwitchStatement]: (node, ctx) => {
        if (!ts.isSwitchStatement(node)) return;
        if (ts.isTypeOfExpression(unwrap(node.expression))) report(node, ctx);
      },
      // `if (typeof x === ...) ... else if (typeof x === ...) ...`
      [ts.SyntaxKind.IfStatement]: (node, ctx) => {
        if (!ts.isIfStatement(node)) return;
        // Only fire on the HEAD of the chain (not an else-if of a parent `if`).
        const parent = node.parent;
        if (parent !== undefined && ts.isIfStatement(parent) && parent.elseStatement === node) {
          return;
        }
        const discriminants: (string | null)[] = [];
        let cur: ts.Statement | undefined = node;
        while (cur !== undefined && ts.isIfStatement(cur)) {
          discriminants.push(typeTestDiscriminant(cur.expression, ctx.sourceFile));
          cur = cur.elseStatement;
        }
        if (discriminants.length < 2) return; // need a real chain.
        const first = discriminants[0];
        if (first === null) return;
        if (!discriminants.every((d) => d !== null && d === first)) return;
        report(node, ctx);
      },
    };
  },
);

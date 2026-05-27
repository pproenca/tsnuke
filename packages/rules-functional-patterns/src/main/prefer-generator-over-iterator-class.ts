import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag classes that implement the iterator protocol by HAND: defining both
 * an instance `next()` method AND an instance `[Symbol.iterator]()` method. A
 * generator function (`function* range() { yield ... }`) produces the same
 * iterator with one line, automatic `return()`/`throw()` plumbing, and no class
 * scaffolding.
 *
 * Detection (crisp — BOTH signals required, both non-static):
 *   1. A non-static instance method named `next`.
 *   2. A non-static instance method whose name is the computed expression
 *      `[Symbol.iterator]`.
 *
 * The static qualifier matters: `class Range { static next() {...}; [Symbol.iterator]() {...} }`
 * is a different (legitimate) shape — static factories on iterables exist.
 *
 * Anti-pattern catalog reference: the catalog's iterator-class tangent.
 */
export const rule = defineRule(
  {
    id: "prefer-generator-over-iterator-class",
    severity: "warning",
    category: "Functional Patterns",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Replace the hand-written iterator class (`next()` + `[Symbol.iterator]()`) with a generator function. `function* range(n) { for (let i = 0; i < n; i++) yield i }` produces the same iterator in one statement, with automatic `return`/`throw` plumbing — no class needed.",
  },
  () => ({
    [ts.SyntaxKind.ClassDeclaration]: (node, ctx) => {
      if (!ts.isClassDeclaration(node)) return;
      const name = node.name;
      if (name === undefined) return;

      const instanceMethods = node.members
        .filter(ts.isMethodDeclaration)
        .filter((m) => !isStatic(m));
      const hasNext = instanceMethods.some(
        (m) => ts.isIdentifier(m.name) && m.name.text === "next",
      );
      if (!hasNext) return;

      const hasSymbolIterator = instanceMethods.some((m) => {
        const n = m.name;
        if (!ts.isComputedPropertyName(n)) return false;
        const expr = n.expression;
        return (
          ts.isPropertyAccessExpression(expr) &&
          ts.isIdentifier(expr.expression) &&
          expr.expression.text === "Symbol" &&
          expr.name.text === "iterator"
        );
      });
      if (!hasSymbolIterator) return;

      const start = name.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Class \`${name.text}\` implements the iterator protocol by hand (\`next()\` + \`[Symbol.iterator]()\`). Prefer a generator function.`,
        help: "Replace the class with `function* x() { ... yield ... }` — generators give you `next`/`return`/`throw` automatically and integrate with `for...of`, spread, and Iterator helpers.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

function isStatic(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ?? false;
}

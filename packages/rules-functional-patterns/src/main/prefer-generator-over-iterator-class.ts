import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";
import { extractClassInfo } from "./_shared.js";

/**
 * SYN — flag classes that implement the iterator protocol by HAND: defining
 * both an instance `next` callable AND an instance `[Symbol.iterator]` callable.
 * A generator function produces the same iterator with one line, automatic
 * `return()`/`throw()` plumbing, and no class scaffolding.
 *
 * Detection (crisp — BOTH signals required, both non-static):
 *   1. A non-static instance callable named `next`.
 *   2. A non-static instance callable whose name is the computed expression
 *      `[Symbol.iterator]`.
 *
 * Both `MethodDeclaration` and `PropertyDeclaration` with arrow/function
 * initializer count as callables — `class R { next = () => {...}; [Symbol.iterator] = () => this }`
 * was previously missed.
 *
 * The static qualifier matters: `class { static next(); [Symbol.iterator]() }`
 * is a different (legitimate) shape — static factories on iterables exist.
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
    [ts.SyntaxKind.ClassDeclaration]: check,
    [ts.SyntaxKind.ClassExpression]: check,
  }),
);

function check(node: ts.Node, ctx: RuleContext): void {
  const info = extractClassInfo(node);
  if (info === undefined) return;

  const instanceCallables = info.node.members.filter((m) => !isStatic(m) && isCallable(m));
  const hasNext = instanceCallables.some(
    (m) => ts.isIdentifier(m.name!) && m.name.text === "next",
  );
  if (!hasNext) return;

  const hasSymbolIterator = instanceCallables.some((m) => {
    const n = m.name;
    if (n === undefined || !ts.isComputedPropertyName(n)) return false;
    const expr = n.expression;
    return (
      ts.isPropertyAccessExpression(expr) &&
      ts.isIdentifier(expr.expression) &&
      expr.expression.text === "Symbol" &&
      expr.name.text === "iterator"
    );
  });
  if (!hasSymbolIterator) return;

  const start = info.reportNode.getStart(ctx.sourceFile);
  const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
  ctx.report({
    filePath: ctx.filePath,
    message: `Class \`${info.className}\` implements the iterator protocol by hand (\`next()\` + \`[Symbol.iterator]()\`). Prefer a generator function.`,
    help: "Replace the class with `function* x() { ... yield ... }` — generators give you `next`/`return`/`throw` automatically and integrate with `for...of`, spread, and Iterator helpers.",
    line: line + 1,
    column: character + 1,
  });
}

function isCallable(member: ts.ClassElement): boolean {
  if (ts.isMethodDeclaration(member)) return true;
  if (ts.isPropertyDeclaration(member)) {
    const init = member.initializer;
    return init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
  }
  return false;
}

function isStatic(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ?? false;
}

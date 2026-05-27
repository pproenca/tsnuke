import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";
import { extractClassInfo } from "./_shared.js";

const FACTORY_METHOD_NAMES = new Set(["create", "make", "build", "of", "from"]);

/**
 * SYN — flag the Factory-class shape: a class whose ONLY meaningful method is
 * named `create` / `make` / `build` / `of` / `from`. Java/C# write Factory Method
 * as a subclass-per-product hierarchy because the language can't polymorphically
 * return arbitrary objects from a function; TypeScript can, so the class
 * hierarchy is ceremony. A function returning a tagged object is idiomatic.
 *
 * Detection (conservative — high bar to fire):
 *   1. The class has EXACTLY ONE non-accessor, non-constructor method (STATIC OR
 *      INSTANCE — `class User { static create() {...} }` is the most common TS
 *      shape and was the original C1 review gap).
 *   2. That method's name is in {create, make, build, of, from}.
 *   3. The class is NOT abstract (abstract factories are usually called by
 *      `extends`-ing in the same file — flagging them would over-fire on the
 *      sibling subclasses).
 *
 * Anti-pattern catalog reference:
 *   `implementation-functional-patterns/references/create-factory-function-over-factory-classes.md`
 */
export const rule = defineRule(
  {
    id: "no-factory-class",
    severity: "warning",
    category: "Functional Patterns",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Replace the Factory class with a factory FUNCTION returning a tagged object. `function notify(channel, message): Notification { switch (channel) { … } }` replaces an `abstract class Factory` + N concrete subclasses. The class form earns its keep only when callers rely on `instanceof`, when a runtime registry enumerates concrete factories, or when construction-invariant enforcement is paired with private fields.",
  },
  () => ({
    [ts.SyntaxKind.ClassDeclaration]: check,
    [ts.SyntaxKind.ClassExpression]: check,
  }),
);

function check(node: ts.Node, ctx: RuleContext): void {
  const info = extractClassInfo(node);
  if (info === undefined) return;
  if (isAbstract(info.node)) return;

  const methodNames = info.node.members
    .filter(ts.isMethodDeclaration)
    .map((m) => (ts.isIdentifier(m.name) ? m.name.text : undefined))
    .filter((n): n is string => n !== undefined);
  if (methodNames.length !== 1) return;

  const onlyName = methodNames[0]!;
  if (!FACTORY_METHOD_NAMES.has(onlyName)) return;

  const start = info.reportNode.getStart(ctx.sourceFile);
  const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
  ctx.report({
    filePath: ctx.filePath,
    message: `Class \`${info.className}\` looks like a Factory (only method is \`${onlyName}\`). Prefer a factory FUNCTION returning a tagged object.`,
    help: "Replace `class XFactory { create(...) { return new X(...) } }` with `function createX(...): X { return { kind: 'x', ... } }`.",
    line: line + 1,
    column: character + 1,
  });
}

function isAbstract(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword) ?? false;
}

import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

const FINISHER_NAMES = new Set(["build", "create", "finish", "make"]);

/**
 * SYN — flag the mutable-Builder class shape: a class with ≥2 instance methods
 * that `return this` (chained setters) and a `build()`/`create()`/`finish()`/
 * `make()` finisher. In TypeScript the same problem is usually solved by an
 * object literal with optional fields; when type-state is needed, a fluent
 * IMMUTABLE builder gives compile-time guarantees the mutable form can't.
 *
 * Detection (conservative — BOTH signals required):
 *   1. ≥2 instance methods whose body ends in `return this;` AND
 *   2. an instance method named `build` / `create` / `finish` / `make`.
 *
 * Anti-pattern catalog reference:
 *   `implementation-functional-patterns/references/create-fluent-immutable-builder.md`
 */
export const rule = defineRule(
  {
    id: "no-mutable-builder-class",
    severity: "warning",
    category: "Functional Patterns",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Replace the mutable Builder class (chained setters + `.build()`) with either an object literal + optional fields (`function createPizza(opts: Partial<Pizza>): Pizza`) or — when type-state is required — a fluent IMMUTABLE builder where each method returns a new builder instance with a different `this:` type constraint. The class form earns its keep only when shared mutable construction state is genuinely needed.",
  },
  () => ({
    [ts.SyntaxKind.ClassDeclaration]: (node, ctx) => {
      if (!ts.isClassDeclaration(node)) return;
      const name = node.name;
      if (name === undefined) return;

      const instanceMethods = node.members
        .filter(ts.isMethodDeclaration)
        .filter((m) => !isStatic(m));
      const chainedSetters = instanceMethods.filter(endsWithReturnThis);
      if (chainedSetters.length < 2) return;

      const hasFinisher = instanceMethods.some(
        (m) => ts.isIdentifier(m.name) && FINISHER_NAMES.has(m.name.text),
      );
      if (!hasFinisher) return;

      const start = name.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Class \`${name.text}\` looks like a mutable Builder (${chainedSetters.length} \`return this\` methods + a finisher). Prefer an object literal with optional fields or a fluent IMMUTABLE builder.`,
        help: "Replace with `function createX(opts: Partial<X>): X { return { ...defaults, ...opts } }` — or, for type-state guarantees, a fluent immutable builder where each step returns a new builder.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

function endsWithReturnThis(method: ts.MethodDeclaration): boolean {
  const body = method.body;
  if (body === undefined) return false;
  const last = body.statements[body.statements.length - 1];
  if (last === undefined || !ts.isReturnStatement(last)) return false;
  return last.expression?.kind === ts.SyntaxKind.ThisKeyword;
}

function isStatic(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ?? false;
}

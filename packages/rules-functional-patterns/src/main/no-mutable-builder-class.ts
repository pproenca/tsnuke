import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";
import { extractClassInfo } from "./_shared.js";

const FINISHER_NAMES = new Set(["build", "create", "finish", "make"]);

/**
 * SYN — flag the mutable-Builder class shape: a class with ≥2 instance methods
 * (or arrow-property "methods") that `return this` (chained setters) and a
 * `build()`/`create()`/`finish()`/`make()` finisher.
 *
 * Detection (conservative — BOTH signals required):
 *   1. ≥2 instance members whose body ends in `return this;` AND
 *   2. an instance member named `build` / `create` / `finish` / `make`.
 *
 * "Instance member" covers both `MethodDeclaration` and
 * `PropertyDeclaration` with an arrow-function initializer — the LLM-default
 * `class P { size = (s) => { …; return this; }; build = () => {...} }` shape
 * was previously missed.
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
    [ts.SyntaxKind.ClassDeclaration]: check,
    [ts.SyntaxKind.ClassExpression]: check,
  }),
);

interface Callable {
  readonly name: string;
  readonly body: ts.ConciseBody | undefined;
}

function check(node: ts.Node, ctx: RuleContext): void {
  const info = extractClassInfo(node);
  if (info === undefined) return;

  const callables = info.node.members
    .filter((m) => !isStatic(m))
    .map(asInstanceCallable)
    .filter((c): c is Callable => c !== undefined);

  const chainedSetters = callables.filter((c) => endsWithReturnThis(c.body));
  if (chainedSetters.length < 2) return;

  const hasFinisher = callables.some((c) => FINISHER_NAMES.has(c.name));
  if (!hasFinisher) return;

  const start = info.reportNode.getStart(ctx.sourceFile);
  const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
  ctx.report({
    filePath: ctx.filePath,
    message: `Class \`${info.className}\` looks like a mutable Builder (${chainedSetters.length} \`return this\` methods + a finisher). Prefer an object literal with optional fields or a fluent IMMUTABLE builder.`,
    help: "Replace with `function createX(opts: Partial<X>): X { return { ...defaults, ...opts } }` — or, for type-state guarantees, a fluent immutable builder where each step returns a new builder.",
    line: line + 1,
    column: character + 1,
  });
}

/**
 * Treat `MethodDeclaration` AND `PropertyDeclaration` with an arrow/function
 * initializer as instance callables — `class P { size = (s) => { …; return this; } }`
 * is what LLM-generated TS often produces instead of the method form.
 */
function asInstanceCallable(member: ts.ClassElement): Callable | undefined {
  if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
    return { name: member.name.text, body: member.body };
  }
  if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
    const init = member.initializer;
    if (init === undefined) return undefined;
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
      return { name: member.name.text, body: init.body };
    }
  }
  return undefined;
}

function endsWithReturnThis(body: ts.ConciseBody | undefined): boolean {
  if (body === undefined) return false;
  if (!ts.isBlock(body)) {
    return body.kind === ts.SyntaxKind.ThisKeyword;
  }
  const last = body.statements[body.statements.length - 1];
  if (last === undefined || !ts.isReturnStatement(last)) return false;
  return last.expression?.kind === ts.SyntaxKind.ThisKeyword;
}

function isStatic(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ?? false;
}

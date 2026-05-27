import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag the Singleton class shape: `class X { private static instance: X;
 * static getInstance() {...} }`. In ES modules a module-scope `const` (or lazy
 * `??=` memo) IS a singleton; wrapping it in a class with a private constructor +
 * `static getInstance()` is anti-idiom in TypeScript — it's harder to mock,
 * harder to swap, harder to tree-shake.
 *
 * Detection (conservative — BOTH signals required to fire):
 *   1. A `private` or `protected` `static` property whose type references the
 *      enclosing class. The access modifier is load-bearing: a `public static
 *      defaultInstance` is a legitimate named-instance pattern, not a Singleton.
 *   2. A `static` method whose body has a `return` expression that reads that
 *      property (supports plain `return X.instance`, the lazy `??=` accessor, and
 *      parenthesized variants).
 *
 * Anti-pattern catalog reference:
 *   `implementation-functional-patterns/references/create-module-scope-over-singleton.md`
 */
export const rule = defineRule(
  {
    id: "no-singleton-class",
    severity: "warning",
    category: "Functional Patterns",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Export a module-scope constant or lazy `??=` memo instead of a Singleton class. ES modules are already singletons — wrapping module state in a class with a private constructor + `static getInstance()` is anti-idiom in TS: harder to mock, harder to replace in tests, harder to tree-shake. Reach for the class form only when the singleton must survive HMR reloads with stable identity, or when test-time swap-by-registration is required.",
  },
  () => ({
    [ts.SyntaxKind.ClassDeclaration]: (node, ctx) => {
      if (!ts.isClassDeclaration(node)) return;
      const name = node.name;
      if (name === undefined) return;
      const className = name.text;

      const field = findEncapsulatedStaticSelfField(node, className);
      if (field === undefined) return;
      if (!ts.isIdentifier(field.name)) return;
      const fieldName = field.name.text;

      if (!classHasStaticReturnerOf(node, className, fieldName)) return;

      const start = name.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Class \`${className}\` looks like a Singleton (private \`static ${fieldName}\` + \`static\` accessor). In ES modules a module-scope const is already a singleton.`,
        help: "Replace `class X { static getInstance() { … } }` with `export const x = createX()` (or a lazy `??=` memo for deferred init).",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

const ENCAPSULATED = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.PrivateKeyword,
  ts.SyntaxKind.ProtectedKeyword,
]);

function findEncapsulatedStaticSelfField(
  cls: ts.ClassDeclaration,
  className: string,
): ts.PropertyDeclaration | undefined {
  return cls.members.find(
    (m): m is ts.PropertyDeclaration =>
      ts.isPropertyDeclaration(m) &&
      modifierKinds(m).has(ts.SyntaxKind.StaticKeyword) &&
      hasAnyModifier(m, ENCAPSULATED) &&
      typeReferencesClass(m.type, className),
  );
}

function classHasStaticReturnerOf(
  cls: ts.ClassDeclaration,
  className: string,
  fieldName: string,
): boolean {
  return cls.members.some(
    (m) =>
      ts.isMethodDeclaration(m) &&
      modifierKinds(m).has(ts.SyntaxKind.StaticKeyword) &&
      m.body !== undefined &&
      blockReturnsField(m.body, className, fieldName),
  );
}

function blockReturnsField(
  block: ts.Block,
  className: string,
  fieldName: string,
): boolean {
  return block.statements.some((stmt) => statementReturnsField(stmt, className, fieldName));
}

function statementReturnsField(
  node: ts.Node,
  className: string,
  fieldName: string,
): boolean {
  if (ts.isReturnStatement(node) && node.expression !== undefined) {
    return expressionReadsField(node.expression, className, fieldName);
  }
  return (
    ts.forEachChild(node, (child) =>
      statementReturnsField(child, className, fieldName) ? true : undefined,
    ) === true
  );
}

function expressionReadsField(
  expr: ts.Expression,
  className: string,
  fieldName: string,
): boolean {
  if (ts.isParenthesizedExpression(expr)) {
    return expressionReadsField(expr.expression, className, fieldName);
  }
  if (ts.isAsExpression(expr) || ts.isNonNullExpression(expr)) {
    return expressionReadsField(expr.expression, className, fieldName);
  }
  if (ts.isPropertyAccessExpression(expr) && expr.name.text === fieldName) {
    const target = expr.expression;
    return (
      (ts.isIdentifier(target) && target.text === className) ||
      target.kind === ts.SyntaxKind.ThisKeyword
    );
  }
  if (ts.isBinaryExpression(expr)) {
    return (
      expressionReadsField(expr.left, className, fieldName) ||
      expressionReadsField(expr.right, className, fieldName)
    );
  }
  return false;
}

function modifierKinds(node: ts.Node): ReadonlySet<ts.SyntaxKind> {
  if (!ts.canHaveModifiers(node)) return new Set();
  return new Set(ts.getModifiers(node)?.map((m) => m.kind) ?? []);
}

function hasAnyModifier(node: ts.Node, kinds: ReadonlySet<ts.SyntaxKind>): boolean {
  const mods = modifierKinds(node);
  return [...kinds].some((k) => mods.has(k));
}

function typeReferencesClass(
  typeNode: ts.TypeNode | undefined,
  className: string,
): boolean {
  if (typeNode === undefined) return false;
  if (ts.isTypeReferenceNode(typeNode)) {
    return ts.isIdentifier(typeNode.typeName) && typeNode.typeName.text === className;
  }
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.some((t) => typeReferencesClass(t, className));
  }
  return false;
}

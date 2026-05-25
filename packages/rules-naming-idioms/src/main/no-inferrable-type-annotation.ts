import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag a redundant type annotation on a variable initialized to a matching
 * primitive literal, e.g. `const n: number = 5`, `const s: string = "x"`,
 * `const b: boolean = true`. Google TS Style Guide: "Leave out type annotations
 * for trivially inferred types: variables … initialized to a `string`, `number`,
 * `boolean` … literal." The annotation is pure noise — the compiler infers the
 * exact same type.
 *
 * Deliberately conservative (annotation must exactly match the literal kind) to
 * avoid touching cases where the annotation is load-bearing:
 *  - widening a literal: `const s: string = "x"` is flagged, but a UNION /
 *    literal-type annotation (`const s: "a" | "b" = "a"`) is NOT — there the
 *    annotation changes the inferred type.
 *  - `new` expressions and `RegExp` literals are left alone (less clear-cut, and
 *    annotations there sometimes widen to a base class / interface on purpose).
 *
 * RULE-026 (broken auto-fix): declares `fixKind: "auto-fix"` but attaches NO
 * `fix` payload — preserved verbatim from the legacy rule.
 */

/** Map an annotation keyword kind to the literal it would trivially infer from. */
function matches(typeNode: ts.TypeNode, init: ts.Expression): boolean {
  switch (typeNode.kind) {
    case ts.SyntaxKind.NumberKeyword:
      return (
        ts.isNumericLiteral(init) ||
        (ts.isPrefixUnaryExpression(init) &&
          (init.operator === ts.SyntaxKind.MinusToken ||
            init.operator === ts.SyntaxKind.PlusToken) &&
          ts.isNumericLiteral(init.operand))
      );
    case ts.SyntaxKind.StringKeyword:
      // A plain string literal or a no-substitution template — but NOT a literal
      // *type* annotation (that is a different TypeNode kind, so we're safe).
      return (
        ts.isStringLiteral(init) ||
        init.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral
      );
    case ts.SyntaxKind.BooleanKeyword:
      return (
        init.kind === ts.SyntaxKind.TrueKeyword ||
        init.kind === ts.SyntaxKind.FalseKeyword
      );
    default:
      return false;
  }
}

function keyword(typeNode: ts.TypeNode): string {
  switch (typeNode.kind) {
    case ts.SyntaxKind.NumberKeyword:
      return "number";
    case ts.SyntaxKind.StringKeyword:
      return "string";
    default:
      return "boolean";
  }
}

export const rule = defineRule(
  {
    id: "no-inferrable-type-annotation",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "auto-fix",
    tags: ["convention"],
    recommendation:
      "Remove the redundant type annotation; the compiler infers the same type from the literal initializer (e.g. write `const n = 5`, not `const n: number = 5`). Keep annotations only when they add information the initializer doesn't.",
  },
  () => ({
    [ts.SyntaxKind.VariableDeclaration]: (node, ctx) => {
      if (!ts.isVariableDeclaration(node)) return;
      const { type, initializer } = node;
      if (type === undefined || initializer === undefined) return;
      // Only a plain identifier binding (skip destructuring patterns).
      if (!ts.isIdentifier(node.name)) return;
      if (!matches(type, initializer)) return;

      const start = type.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Redundant \`: ${keyword(type)}\` annotation; it is trivially inferred from the literal.`,
        help: "Remove the annotation and let the compiler infer it (e.g. `const x = 5` instead of `const x: number = 5`).",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

/**
 * SYN — flag `<object|array literal> as T` (named type) and prefer `satisfies T`.
 *
 * `as T` on a literal widens the value to `T`, discarding the precise inferred
 * type and silently accepting excess/missing-property mismatches. Modern TS's
 * `satisfies T` validates the literal against `T` WITHOUT widening, keeping the
 * narrow inferred type. `as const` is intentionally excluded — it narrows, not
 * launders.
 */
export const rule = defineRule(
  {
    id: "prefer-satisfies-over-as",
    severity: "warning",
    category: "Type Assertions & Escapes",
    tier: "SYN",
    fixKind: "codemod",
    tags: ["ts-idiom"],
    recommendation:
      "Use `satisfies T` instead of `as T` on an object/array literal — it validates the literal without widening its precise inferred type.",
  },
  () => ({
    [ts.SyntaxKind.AsExpression]: (node, ctx) => {
      if (!ts.isAsExpression(node)) return;

      // Only flag literals — that's where `satisfies` pays off.
      if (
        !ts.isObjectLiteralExpression(node.expression) &&
        !ts.isArrayLiteralExpression(node.expression)
      ) {
        return;
      }

      // Exclude `as const` — it narrows the literal, it doesn't launder it.
      if (
        ts.isTypeReferenceNode(node.type) &&
        ts.isIdentifier(node.type.typeName) &&
        node.type.typeName.text === "const"
      ) {
        return;
      }

      // Exclude `as any` / `as unknown` — those are escape hatches other rules own.
      if (
        node.type.kind === ts.SyntaxKind.AnyKeyword ||
        node.type.kind === ts.SyntaxKind.UnknownKeyword
      ) {
        return;
      }

      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "Use `satisfies T` instead of `as T` on a literal.",
        help: "Replace `as T` with `satisfies T`; it validates the literal against `T` without widening its precise inferred type.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

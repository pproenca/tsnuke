import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag asserting a structured object shape onto an existing value, e.g.
 * `error as { exitCode?: unknown; message?: unknown } | null | undefined`. This
 * fabricates a type the compiler never verified — validation is skipped and the
 * responsibility shifts to "hope the shape is right." Narrow with a type guard
 * or validate the data (schema) instead.
 *
 * Distinct from `prefer-satisfies-over-as` (which targets a literal *value* `as
 * T`): here the asserted-onto expression is NOT a literal — it's a real value
 * being re-shaped — and the asserted type is an inline object shape / `Record`.
 */

/** Does this type node assert an inline structural object shape? */
function isStructuralShape(type: ts.TypeNode): boolean {
  if (ts.isTypeLiteralNode(type)) return true; // { ... }
  if (ts.isUnionTypeNode(type)) return type.types.some(isStructuralShape);
  if (ts.isParenthesizedTypeNode(type)) return isStructuralShape(type.type);
  if (
    ts.isTypeReferenceNode(type) &&
    ts.isIdentifier(type.typeName) &&
    type.typeName.text === "Record"
  ) {
    return true; // ... as Record<...>
  }
  return false;
}

export const rule = defineRule(
  {
    id: "no-unsafe-object-assertion",
    severity: "warning",
    category: "Type Assertions & Escapes",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom", "type-guard"],
    recommendation:
      "Don't assert a structural shape onto a value — the compiler never checks it. Narrow with a type guard (`'x' in v`, `instanceof`) or validate with a schema (zod/valibot) before use.",
  },
  () => ({
    [ts.SyntaxKind.AsExpression]: (node, ctx) => {
      if (!ts.isAsExpression(node)) return;
      // Skip literal-value casts — that's `prefer-satisfies-over-as`'s job.
      let value: ts.Expression = node.expression;
      while (ts.isParenthesizedExpression(value)) value = value.expression;
      if (ts.isObjectLiteralExpression(value) || ts.isArrayLiteralExpression(value)) return;

      if (!isStructuralShape(node.type)) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Asserting a structural object shape onto a value skips validation. Narrow with a type guard or validate the data instead of `as`.",
        help: "Use `in`/`instanceof` narrowing or a runtime schema; an `as { … }` cast fabricates an unchecked type.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

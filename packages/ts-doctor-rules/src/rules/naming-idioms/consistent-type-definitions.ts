import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * SYN — flag an object-shape `type X = { ... }` alias that Google says should be
 * an `interface`. Google TS Style Guide: "when declaring types for objects, use
 * interfaces instead of a type alias for the object literal expression."
 * Interfaces give better error messages, support declaration merging / `extends`,
 * and read as a nominal-ish contract.
 *
 * Deliberately conservative — fires ONLY when the alias RHS is a single object
 * `TypeLiteral`. Aliases whose RHS is a union, intersection, mapped type,
 * function type, tuple, conditional, indexed access, or a bare reference are NOT
 * flagged: those legitimately can't (or shouldn't) be interfaces.
 *
 * NOTE: overlaps with `prefer-interface-for-large-object-type`, which flags only
 * LARGE object-type aliases. This is the GENERAL form (any size). Tagged
 * `convention` so it can be opted out independently where the narrower size-gated
 * rule is preferred.
 */

export const rule = defineRule(
  {
    id: "consistent-type-definitions",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "codemod",
    tags: ["convention"],
    recommendation:
      "Declare object shapes with `interface X { ... }` rather than `type X = { ... }`. Interfaces give clearer errors, support `extends` and declaration merging, and signal an object contract. Keep `type` for unions, intersections, mapped/conditional types, tuples, and function types.",
  },
  () => ({
    [ts.SyntaxKind.TypeAliasDeclaration]: (node, ctx) => {
      if (!ts.isTypeAliasDeclaration(node)) return;
      const t = node.type;
      // Only a single object TypeLiteral on the RHS — nothing else qualifies.
      // A mapped type (`{ [K in U]: V }`) parses as a MappedTypeNode, not a
      // TypeLiteralNode, so it is already excluded here.
      if (!ts.isTypeLiteralNode(t)) return;
      // An empty `type X = {}` is the `{}`-type smell, handled elsewhere; skip.
      if (t.members.length === 0) return;

      const start = node.name.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Object-shape alias \`type ${node.name.text} = { ... }\` should be an \`interface\`.`,
        help: `Rewrite as \`interface ${node.name.text} { ... }\`. Interfaces give better errors and support \`extends\` / declaration merging.`,
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

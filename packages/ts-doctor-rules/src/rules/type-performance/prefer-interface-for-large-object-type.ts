import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/** Object-type aliases beyond this many members are better expressed as an interface. */
const LARGE_OBJECT_TYPE_MEMBERS = 12;

/**
 * SYN — prefer an `interface` for a large object `type` alias.
 *
 * A `type T = { ... }` object-literal alias is re-instantiated by the checker on
 * every use, whereas an `interface` is cached (interned) by name — so for wide
 * object shapes an interface meaningfully reduces type-checking work. AST-only:
 * a `TypeAliasDeclaration` whose `type` is a type literal with more than
 * {@link LARGE_OBJECT_TYPE_MEMBERS} members.
 */
export const rule = defineRule(
  {
    id: "prefer-interface-for-large-object-type",
    severity: "warning",
    category: "Type Performance",
    tier: "SYN",
    fixKind: "manual",
    tags: ["performance"],
    recommendation:
      "Declare large object shapes as an `interface` instead of a `type` alias: large object type aliases re-instantiate on every use, while an interface is cached by the compiler.",
  },
  () => ({
    [ts.SyntaxKind.TypeAliasDeclaration]: (node, ctx) => {
      if (!ts.isTypeAliasDeclaration(node)) return;
      if (!ts.isTypeLiteralNode(node.type)) return;
      if (node.type.members.length <= LARGE_OBJECT_TYPE_MEMBERS) return;

      const start = node.name.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Large object type alias \`${node.name.text}\` (${node.type.members.length} members); prefer an \`interface\`.`,
        help: "Large object type aliases re-instantiate on every use; an `interface` is cached by the compiler.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * Object-type aliases beyond this many members are better expressed as an interface.
 *
 * NOTE (RULE-010): this value (12) duplicates `MAX_UNION_MEMBERS` (RULE-008) but is
 * kept as its OWN independent constant on purpose — the two thresholds must NOT couple,
 * so they can be tuned separately. Do not collapse them into a shared constant.
 */
const LARGE_OBJECT_TYPE_MEMBERS = 12;

/**
 * SYN — prefer an `interface` for a large object `type` alias (RULE-010).
 *
 * A `type T = { ... }` object-literal alias is re-instantiated by the checker on
 * every use, whereas an `interface` is cached (interned) by name — so for wide
 * object shapes an interface meaningfully reduces type-checking work. AST-only:
 * a `TypeAliasDeclaration` whose `type` is a type literal with more than
 * {@link LARGE_OBJECT_TYPE_MEMBERS} members.
 *
 * Scoping (RULE-010 edge case): only direct object-literal aliases; intersections /
 * mapped types are skipped.
 *
 * Ported verbatim from legacy
 * `packages/tsnuke-rules/src/rules/type-performance/prefer-interface-for-large-object-type.ts`;
 * the only change is importing `defineRule` from the `@tsnuke/rules-core-effect`
 * substrate rather than the legacy `../../define-rule.js`.
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

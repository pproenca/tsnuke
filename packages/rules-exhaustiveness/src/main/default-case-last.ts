import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — when a `switch` has a `default` clause, it should be the last clause.
 * A `default` placed among the `case`s is legal but reads poorly: it hides the
 * fall-through catch-all in the middle of the dispatch table. (Behavior is
 * unaffected by ordering; this is a readability rule.)
 */
export const rule = defineRule(
  {
    id: "default-case-last",
    severity: "warning",
    category: "Exhaustiveness & Narrowing",
    tier: "SYN",
    fixKind: "manual",
    tags: ["readability"],
    recommendation:
      "Move the `default` clause to the end of the `switch`. It's the catch-all and reads most clearly last.",
  },
  () => ({
    [ts.SyntaxKind.SwitchStatement]: (node, ctx) => {
      if (!ts.isSwitchStatement(node)) return;
      const clauses = node.caseBlock.clauses;
      const defaultIndex = clauses.findIndex((c) => ts.isDefaultClause(c));
      if (defaultIndex === -1) return; // no default — nothing to order.
      if (defaultIndex === clauses.length - 1) return; // already last.

      const defaultClause = clauses[defaultIndex]!;
      const start = defaultClause.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "the `default` clause should come last for readability",
        help: "Reorder the `switch` so the `default` clause is the final clause.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

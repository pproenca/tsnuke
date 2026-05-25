import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * TYP (Tier-2, type-aware) — flag a non-null assertion (`expr!`) whose operand's
 * type already excludes `null` and `undefined`. The `!` then asserts away nothing:
 * it is dead syntax that hides the operator's real intent and survives refactors
 * that later make the value nullable. Deciding whether the operand can be nullish
 * needs the `ts.TypeChecker`, so the body early-returns when no checker is present
 * (Tier-1 / broken-project path) — which is why `runRule` (no checker) yields
 * nothing. (`no-non-null-assertion` is the SYN companion that flags every `!`.)
 */
export const rule = defineRule(
  {
    id: "no-unnecessary-non-null-assertion",
    severity: "warning",
    category: "Type Assertions & Escapes",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["escape-hatch"],
    recommendation:
      "Remove the `!` — the operand's type already excludes `null`/`undefined`, so the assertion is dead syntax that masks intent and survives refactors that later make the value nullable.",
  },
  () => ({
    [ts.SyntaxKind.NonNullExpression]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return; // Tier-1 / no type info — cannot decide.
      if (!ts.isNonNullExpression(node)) return;

      const type = checker.getTypeAtLocation(node.expression);
      const constituents = type.isUnion() ? type.types : [type];

      const isNullish = (t: ts.Type): boolean =>
        (t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0;

      // If ANY constituent is null/undefined the `!` does real work — keep it.
      if (constituents.some(isNullish)) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Unnecessary non-null assertion: the operand cannot be `null` or `undefined`.",
        help: "Remove the `!` — the operand's type already excludes nullish values, so the assertion is dead syntax.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

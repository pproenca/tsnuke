import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

const PRIMITIVE_THROW =
  ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike;

/**
 * TYP (Tier-2, type-aware) — only throw `Error` (sub)instances, never raw
 * primitives. Conservative: flags a `throw` whose value is a string / number /
 * boolean (the unambiguous "not an Error" cases); requires the checker.
 */
export const rule = defineRule(
  {
    id: "only-throw-error",
    severity: "error",
    category: "Error Handling",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["error-handling", "correctness"],
    recommendation:
      "Throw an `Error` (or subclass) so stack traces and `instanceof` checks work. Wrap a primitive in `new Error(String(value))`.",
  },
  () => ({
    [ts.SyntaxKind.ThrowStatement]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return;
      if (!ts.isThrowStatement(node)) return;

      const type = checker.getTypeAtLocation(node.expression);
      if ((type.flags & PRIMITIVE_THROW) === 0) return; // not a clear primitive throw.

      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Throwing a non-Error value (${checker.typeToString(type)}).`,
        help: "Throw an `Error` subclass instead, e.g. `throw new Error(...)`.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

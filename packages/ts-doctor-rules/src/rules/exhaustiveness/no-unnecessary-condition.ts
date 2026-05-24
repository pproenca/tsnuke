import ts from "typescript";
import { defineRule } from "../../define-rule.js";
import type { RuleContext } from "../../define-rule.js";

/**
 * TYP (Tier-2, type-aware) — flag a condition whose type is ALWAYS truthy
 * because it is a non-empty pure object type (e.g. `if (o)` where
 * `o: { a: number }`). Such a condition can never be falsy, so the test is
 * pointless and usually signals a logic error (a forgotten `?`/`!= null`).
 *
 * Registered with `tier:"TYP"` and `requires:["typecheck:ok"]`; activates only
 * under a clean type-check (BC-10). Reasoning over the condition's type needs
 * the `ts.TypeChecker`, so the body early-returns without one (Tier-1 / broken-
 * project path). Conservative by design: it reports ONLY when every union part
 * is an object type, no part can be falsy (no primitive / nullish / unknown
 * member), and the type has at least one property — so the bare `{}` type
 * (which also accepts primitives) is excluded.
 */

/**
 * The set of flags that mean a constituent COULD be falsy (or is too imprecise
 * to reason about). If any part of the condition type carries one of these, we
 * bail — the condition might legitimately be falsy.
 */
const FALSY_OR_IMPRECISE_FLAGS: ts.TypeFlags =
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.Null |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Boolean |
  ts.TypeFlags.BooleanLiteral |
  ts.TypeFlags.Number |
  ts.TypeFlags.NumberLiteral |
  ts.TypeFlags.BigInt |
  ts.TypeFlags.String |
  ts.TypeFlags.StringLiteral |
  ts.TypeFlags.ESSymbol |
  ts.TypeFlags.Void |
  ts.TypeFlags.Never;

export const rule = defineRule(
  {
    id: "no-unnecessary-condition",
    severity: "warning",
    category: "Exhaustiveness & Narrowing",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["exhaustiveness", "correctness"],
    recommendation:
      "This condition is always truthy because its type is a non-empty object that can never be nullish. Remove the redundant check, or widen the type (e.g. add `| undefined`) if the value really can be absent.",
  },
  () => {
    const check = (condition: ts.Expression, ctx: RuleContext): void => {
      const checker = ctx.checker;
      if (checker === undefined) return; // Tier-1 / no type info — cannot decide.

      const t = checker.getTypeAtLocation(condition);
      const parts = t.isUnion() ? t.types : [t];

      // Every part must be a pure object type...
      const everyPartIsObject = parts.every(
        (p) => (p.flags & ts.TypeFlags.Object) !== 0,
      );
      if (!everyPartIsObject) return;

      // ...and NO part may be falsy or imprecise.
      const anyPartFalsyOrImprecise = parts.some(
        (p) => (p.flags & FALSY_OR_IMPRECISE_FLAGS) !== 0,
      );
      if (anyPartFalsyOrImprecise) return;

      // ...and the type must have at least one property, so the empty `{}` type
      // (which accepts primitives, hence can be falsy) is excluded.
      if (t.getProperties().length === 0) return;

      const start = condition.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "condition is always truthy",
        help: "Remove the redundant check, or widen the type (e.g. `| undefined`) if the value can actually be absent.",
        line: line + 1,
        column: character + 1,
      });
    };

    return {
      [ts.SyntaxKind.IfStatement]: (node, ctx) => {
        if (!ts.isIfStatement(node)) return;
        check(node.expression, ctx);
      },
      [ts.SyntaxKind.WhileStatement]: (node, ctx) => {
        if (!ts.isWhileStatement(node)) return;
        check(node.expression, ctx);
      },
      [ts.SyntaxKind.DoStatement]: (node, ctx) => {
        if (!ts.isDoStatement(node)) return;
        check(node.expression, ctx);
      },
      [ts.SyntaxKind.ConditionalExpression]: (node, ctx) => {
        if (!ts.isConditionalExpression(node)) return;
        check(node.condition, ctx);
      },
    };
  },
);

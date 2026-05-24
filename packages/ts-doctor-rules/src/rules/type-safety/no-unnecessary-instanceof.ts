import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * TYP — flag `x instanceof Foo` where the type already proves `x` IS a `Foo`
 * (always true): the runtime check is redundant — the narrowing belongs in the
 * type, not a runtime guard. Conservative: only the unambiguous same-class case
 * is reported (matched by the instance type's symbol), so subclass checks and
 * genuine unions are left alone (false negatives over false positives).
 */
export const rule = defineRule(
  {
    id: "no-unnecessary-instanceof",
    severity: "warning",
    category: "Type Safety",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["ts-idiom", "type-guard"],
    recommendation:
      "The type already proves this `instanceof` is always true. Remove the runtime guard — the value is already known to be this class.",
  },
  () => ({
    [ts.SyntaxKind.BinaryExpression]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return;
      if (!ts.isBinaryExpression(node)) return;
      if (node.operatorToken.kind !== ts.SyntaxKind.InstanceOfKeyword) return;

      const leftType = checker.getTypeAtLocation(node.left);
      // Bail on any/unknown/union — only the unambiguous single-type case.
      if (leftType.isUnion()) return;
      if (leftType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return;

      const rhsType = checker.getTypeAtLocation(node.right);
      const ctorSigs = rhsType.getConstructSignatures();
      if (ctorSigs.length === 0) return;
      const firstSig = ctorSigs[0];
      if (firstSig === undefined) return;
      const instanceType = firstSig.getReturnType();

      const leftSym = leftType.getSymbol();
      const instSym = instanceType.getSymbol();
      if (leftSym === undefined || instSym === undefined) return;
      if (leftSym !== instSym) return; // not provably the same class — leave it.

      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Unnecessary \`instanceof\` (always true): the type already proves this value is \`${instSym.getName()}\`.`,
        help: "Remove the runtime guard; the value is already typed as this class.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

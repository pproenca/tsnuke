import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

/**
 * TYP — flag a `typeof x === "..."` comparison the type system already settles:
 * either always true (the type guarantees the result — the runtime check is
 * redundant; use the value directly) or always false (the type can never be that
 * — dead code / a bug). This is the canonical "delegated to runtime what the
 * type already carries" anti-pattern (common in LLM-generated TS).
 */

/** The set of `typeof` results a type can produce, or `null` if it can't be reasoned about. */
function typeofResults(type: ts.Type): Set<string> | null {
  const out = new Set<string>();
  const parts = type.isUnion() ? type.types : [type];
  for (const p of parts) {
    const f = p.flags;
    if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) {
      return null; // can't reason — bail (no false positives).
    }
    if (f & ts.TypeFlags.StringLike) out.add("string");
    else if (f & ts.TypeFlags.NumberLike) out.add("number");
    else if (f & ts.TypeFlags.BigIntLike) out.add("bigint");
    else if (f & ts.TypeFlags.BooleanLike) out.add("boolean");
    else if (f & ts.TypeFlags.ESSymbolLike) out.add("symbol");
    else if (f & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) out.add("undefined");
    else if (f & ts.TypeFlags.Null) out.add("object");
    else if (f & ts.TypeFlags.Object) {
      // An object type is "object" — or "function" if it is callable/constructable.
      const callable = p.getCallSignatures().length > 0 || p.getConstructSignatures().length > 0;
      out.add(callable ? "function" : "object");
    } else if (f & ts.TypeFlags.Never) {
      // contributes nothing
    } else {
      return null; // unrecognized shape — bail.
    }
  }
  return out;
}

/** Extract the `typeof x === "..."` pair from either operand orientation. */
function typeofPair(
  node: ts.BinaryExpression,
): { typeofExpr: ts.TypeOfExpression; literal: string } | undefined {
  if (ts.isTypeOfExpression(node.left) && ts.isStringLiteralLike(node.right)) {
    return { typeofExpr: node.left, literal: node.right.text };
  }
  if (ts.isTypeOfExpression(node.right) && ts.isStringLiteralLike(node.left)) {
    return { typeofExpr: node.right, literal: node.left.text };
  }
  return undefined;
}

export const rule = defineRule(
  {
    id: "no-unnecessary-typeof",
    severity: "warning",
    category: "Type Safety",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["ts-idiom", "type-guard"],
    recommendation:
      "The type already determines this `typeof` result. Remove the runtime check and use the value directly — let the type system carry the guarantee instead of re-checking at runtime.",
  },
  () => ({
    [ts.SyntaxKind.BinaryExpression]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return;
      if (!ts.isBinaryExpression(node)) return;
      const op = node.operatorToken.kind;
      const isEq =
        op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        op === ts.SyntaxKind.EqualsEqualsToken;
      const isNeq =
        op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsToken;
      if (!isEq && !isNeq) return;

      const pair = typeofPair(node);
      if (pair === undefined) return;
      const { typeofExpr, literal } = pair;

      const results = typeofResults(checker.getTypeAtLocation(typeofExpr.expression));
      if (results === null) return;
      const present = results.has(literal);
      const onlyThis = results.size === 1 && present;

      const verdict = isEq
        ? !present
          ? "always-false"
          : onlyThis
            ? "always-true"
            : null
        : !present
          ? "always-true"
          : onlyThis
            ? "always-false"
            : null;
      if (verdict === null) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          verdict === "always-true"
            ? `Unnecessary \`typeof\` check (always true): the type already guarantees \`typeof … === "${literal}"\`.`
            : `\`typeof\` check is always false: the type can never be "${literal}" — dead code or a bug.`,
        help:
          verdict === "always-true"
            ? "Remove the runtime check and use the value directly; the type carries this guarantee."
            : "The type excludes this case. Remove the branch or fix the type.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

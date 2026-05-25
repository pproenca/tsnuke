import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";
import type { RuleContext } from "@ts-doctor/rules-core-effect";

/**
 * SYN — flag a function whose declared return type is `unknown` (or
 * `Promise<unknown>`). Returning `unknown` pushes the narrowing burden onto
 * every caller — each one must re-check or assert. Narrow/validate at THIS
 * boundary and return a precise type (or a `Result`/validated shape).
 *
 * Only explicit `unknown` return annotations are flagged (no inference) to keep
 * it precise. `unknown` *parameters* are fine — they're good practice — and are
 * not touched.
 */

function isUnknownReturn(type: ts.TypeNode): boolean {
  if (type.kind === ts.SyntaxKind.UnknownKeyword) return true;
  // Promise<unknown>
  if (
    !ts.isTypeReferenceNode(type) ||
    !ts.isIdentifier(type.typeName) ||
    type.typeName.text !== "Promise" ||
    type.typeArguments?.length !== 1
  ) {
    return false;
  }
  return type.typeArguments[0]?.kind === ts.SyntaxKind.UnknownKeyword;
}

export const rule = defineRule(
  {
    id: "no-unknown-return",
    severity: "warning",
    category: "Type Safety",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Don't return `unknown` — it forces every caller to narrow. Validate/parse at this boundary and return a precise type (or a discriminated `Result`).",
  },
  () => {
    const check = (node: ts.Node, ctx: RuleContext): void => {
      const fn = node as ts.FunctionLikeDeclaration;
      if (fn.type === undefined || !isUnknownReturn(fn.type)) return;
      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Function returns `unknown`, delegating narrowing to every caller. Validate here and return a precise type.",
        help: "Parse/validate at this boundary (type guard or schema) and return the concrete type instead of `unknown`.",
        line: line + 1,
        column: character + 1,
      });
    };
    return {
      [ts.SyntaxKind.FunctionDeclaration]: check,
      [ts.SyntaxKind.FunctionExpression]: check,
      [ts.SyntaxKind.ArrowFunction]: check,
      [ts.SyntaxKind.MethodDeclaration]: check,
    };
  },
);

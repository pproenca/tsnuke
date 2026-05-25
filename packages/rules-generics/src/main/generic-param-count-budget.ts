import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";
import type { RuleContext } from "@ts-fix/rules-core-effect";

/**
 * SYN — budget on the number of type parameters on a single declaration. A
 * function/class/interface/type-alias carrying many generic parameters is hard to
 * call and reason about; past a small budget it usually signals a missing
 * abstraction (an options object, a base type, or split declarations). No checker
 * needed — type parameters are read straight off the declaration node.
 *
 * RULE-007. Threshold `GENERIC_PARAM_THRESHOLD = 4` is EXCLUSIVE (`>` budget): a
 * declaration with exactly 4 type parameters is allowed; 5+ fires. Only the 5 named
 * declaration kinds below are covered — arrow functions and function expressions are
 * NOT (per RULE-007 edge cases).
 *
 * Ported VERBATIM from legacy
 * `packages/ts-fix-rules/src/rules/generics/generic-param-count-budget.ts`;
 * the only change is importing `defineRule` / `RuleContext` from the
 * `@ts-fix/rules-core-effect` substrate rather than the legacy `../../define-rule.js`.
 */
const GENERIC_PARAM_THRESHOLD = 4;

/** Declarations that can carry `typeParameters` and that we want to budget. */
type GenericBearingDeclaration =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.ClassDeclaration
  | ts.InterfaceDeclaration
  | ts.TypeAliasDeclaration;

/** Shared handler: report when a declaration exceeds the type-parameter budget. */
function checkTypeParamCount(node: ts.Node, ctx: RuleContext): void {
  if (
    !ts.isFunctionDeclaration(node) &&
    !ts.isMethodDeclaration(node) &&
    !ts.isClassDeclaration(node) &&
    !ts.isInterfaceDeclaration(node) &&
    !ts.isTypeAliasDeclaration(node)
  ) {
    return;
  }

  const decl: GenericBearingDeclaration = node;
  const typeParams = decl.typeParameters;
  if (typeParams === undefined || typeParams.length <= GENERIC_PARAM_THRESHOLD) {
    return;
  }

  const start = node.getStart(ctx.sourceFile);
  const { line, character } =
    ctx.sourceFile.getLineAndCharacterOfPosition(start);
  ctx.report({
    filePath: ctx.filePath,
    message: `Too many type parameters: ${typeParams.length} declared (budget is ${GENERIC_PARAM_THRESHOLD}).`,
    help: "A declaration with many generic parameters is hard to call and reason about. Consider an options object, a shared base type, or splitting the declaration.",
    line: line + 1,
    column: character + 1,
  });
}

export const rule = defineRule(
  {
    id: "generic-param-count-budget",
    severity: "warning",
    category: "Generics & Type-Level Complexity",
    tier: "SYN",
    fixKind: "manual",
    tags: ["generics"],
    recommendation:
      "Reduce the number of type parameters on this declaration. Past a small budget, many generics usually signal a missing abstraction — an options object, a shared base type, or split declarations.",
  },
  () => ({
    [ts.SyntaxKind.FunctionDeclaration]: checkTypeParamCount,
    [ts.SyntaxKind.MethodDeclaration]: checkTypeParamCount,
    [ts.SyntaxKind.ClassDeclaration]: checkTypeParamCount,
    [ts.SyntaxKind.InterfaceDeclaration]: checkTypeParamCount,
    [ts.SyntaxKind.TypeAliasDeclaration]: checkTypeParamCount,
  }),
);

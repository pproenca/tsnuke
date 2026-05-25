import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";
import type { RuleContext } from "@ts-fix/rules-core-effect";

/**
 * TYP — a function with an `any`-typed parameter that flows to an `any` return
 * erases the caller's type: `(x: any): any` accepts anything and yields `any`,
 * so every call site loses type information. The relationship the function
 * *should* carry (input type → output type) has been delegated away to `any`.
 * Make it generic (`<T>(x: T): …`) so the caller's type survives.
 *
 * Conservative: fires only when an explicitly-`any` parameter is actually
 * referenced by a `return` (a genuine passthrough/derivation) AND the resolved
 * return type is `any`. Requires the checker (to see inferred `any` returns).
 *
 * Ported VERBATIM from legacy
 * `packages/ts-fix-rules/src/rules/generics/prefer-generic-over-any-passthrough.ts`;
 * the only change is importing `defineRule` / `RuleContext` from the
 * `@ts-fix/rules-core-effect` substrate rather than the legacy `../../define-rule.js`.
 * The legacy `ctx.checker === undefined` early-return guard is preserved exactly — the
 * engine drives this rule on the `typecheck:ok` path that supplies `ctx.checker` (the
 * `runTypeAwareRule` driver in tests).
 */

const FN_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Constructor,
]);

/** Does any `return` in `fn`'s own body reference one of `names` (not crossing nested fns)? */
function returnReferencesParam(fn: ts.FunctionLikeDeclaration, names: ReadonlySet<string>): boolean {
  const body = fn.body;
  if (body === undefined) return false;

  const exprReferences = (expr: ts.Node): boolean => {
    let found = false;
    const visit = (n: ts.Node): void => {
      if (found) return;
      if (ts.isIdentifier(n) && names.has(n.text)) {
        found = true;
        return;
      }
      n.forEachChild(visit);
    };
    visit(expr);
    return found;
  };

  // Concise arrow body: the body *is* the returned expression.
  if (!ts.isBlock(body)) return exprReferences(body);

  let found = false;
  const walk = (n: ts.Node): void => {
    if (found) return;
    if (ts.isReturnStatement(n) && n.expression !== undefined) {
      if (exprReferences(n.expression)) {
        found = true;
        return;
      }
    }
    n.forEachChild((child) => {
      if (found) return;
      if (FN_KINDS.has(child.kind)) return; // returns inside nested fns aren't ours.
      walk(child);
    });
  };
  walk(body);
  return found;
}

export const rule = defineRule(
  {
    id: "prefer-generic-over-any-passthrough",
    severity: "warning",
    category: "Generics & Type-Level Complexity",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Replace the `any` parameter+return with a generic type parameter (e.g. `<T>(x: T): T`) so the caller's type flows through instead of being erased to `any`.",
  },
  () => {
    const check = (node: ts.Node, ctx: RuleContext): void => {
      const checker = ctx.checker;
      if (checker === undefined) return;
      const fn = node as ts.FunctionLikeDeclaration;

      // Parameters explicitly annotated `: any`.
      const anyParamNames = new Set(
        fn.parameters
          .filter(
            (p) =>
              p.type !== undefined &&
              p.type.kind === ts.SyntaxKind.AnyKeyword &&
              ts.isIdentifier(p.name),
          )
          .map((p) => (p.name as ts.Identifier).text),
      );
      if (anyParamNames.size === 0) return;

      // Resolved return type must be `any` (catches both `: any` and inferred any).
      const sig = checker.getSignatureFromDeclaration(fn);
      if (sig === undefined) return;
      if ((sig.getReturnType().flags & ts.TypeFlags.Any) === 0) return;

      // The any param must actually flow to a return (passthrough/derivation).
      if (!returnReferencesParam(fn, anyParamNames)) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "`any` parameter flows to an `any` return, erasing the caller's type. Use a generic type parameter to preserve it.",
        help: "Replace `(x: any): any` with `<T>(x: T): T` (or the appropriate relationship) so the input type carries through to the output.",
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

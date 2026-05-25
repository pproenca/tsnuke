import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";
import type { RuleContext } from "@ts-doctor/rules-core-effect";

/**
 * TYP (Tier-2, type-aware) — flag passing an `any`-typed value into a typed
 * parameter. The `any` argument is accepted without checking, so a type mismatch
 * (e.g. a string flowing into a `number` parameter) goes undetected at the call
 * boundary. Conservative: only fires when the argument is `any` AND the resolved
 * parameter is a concrete type (not `any`/`unknown`, which legitimately accept
 * anything). Resolving the call signature + parameter types needs the
 * `ts.TypeChecker`, so the body early-returns when no checker is present (Tier-1 /
 * broken-project path) — which is why `runRule` (no checker) still yields nothing.
 */
export const rule = defineRule(
  {
    id: "no-unsafe-argument",
    severity: "error",
    category: "Type Safety",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["type-safety"],
    recommendation:
      "Narrow the value to the parameter's type before passing it. An `any`-typed argument is accepted without checking, so a mismatch at the call boundary goes undetected.",
  },
  () => ({
    [ts.SyntaxKind.CallExpression]: (node, ctx) => {
      check(node, ctx);
    },
    [ts.SyntaxKind.NewExpression]: (node, ctx) => {
      check(node, ctx);
    },
  }),
);

function check(node: ts.Node, ctx: RuleContext): void {
  const checker = ctx.checker;
  if (checker === undefined) return; // Tier-1 / no type info — cannot decide.
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return;

  const args = node.arguments;
  if (args === undefined) return; // `new Foo` with no parens — no arguments.

  const sig = checker.getResolvedSignature(node);
  if (sig === undefined) return; // couldn't resolve the callee — bail.

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    const argType = checker.getTypeAtLocation(arg);
    if ((argType.flags & ts.TypeFlags.Any) === 0) continue; // arg isn't `any`.

    const param = sig.parameters[i];
    if (param === undefined) continue; // rest/variadic past the declared list.

    const paramType = checker.getTypeOfSymbolAtLocation(param, node);
    // `any`/`unknown` parameters legitimately accept anything — no unsafety.
    if ((paramType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
      continue;
    }

    const start = arg.getStart(ctx.sourceFile);
    const { line, character } =
      ctx.sourceFile.getLineAndCharacterOfPosition(start);
    ctx.report({
      filePath: ctx.filePath,
      message: "Unsafe argument: passing an `any`-typed value into a typed parameter.",
      help: "Narrow the value to the parameter's type before passing it; an `any` argument bypasses checking.",
      line: line + 1,
      column: character + 1,
    });
  }
}

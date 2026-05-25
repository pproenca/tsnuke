import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

/**
 * SYN — a `Promise` executor (the function passed to `new Promise(...)`) must not
 * be `async`. The executor's return value is ignored, so if it throws (or its
 * returned promise rejects) that rejection is swallowed rather than forwarded to
 * the constructed promise — a silent error-loss bug.
 *
 * Ported VERBATIM from legacy
 * `packages/ts-doctor-rules/src/rules/async/no-async-promise-executor.ts`; the only
 * change is importing `defineRule` from the `@ts-doctor/rules-core-effect` substrate
 * rather than the legacy `../../define-rule.js`.
 */
export const rule = defineRule(
  {
    id: "no-async-promise-executor",
    severity: "error",
    category: "Async / Promises",
    tier: "SYN",
    fixKind: "manual",
    tags: ["async", "correctness"],
    recommendation:
      "Don't pass an `async` function to `new Promise(...)`: the executor's returned promise is discarded, so a rejection inside it is swallowed. Use a plain (non-async) executor and call `resolve`/`reject` directly.",
  },
  () => ({
    [ts.SyntaxKind.NewExpression]: (node, ctx) => {
      if (!ts.isNewExpression(node)) return;
      if (!ts.isIdentifier(node.expression) || node.expression.text !== "Promise") {
        return;
      }
      const first = node.arguments?.[0];
      if (first === undefined) return;
      if (!ts.isArrowFunction(first) && !ts.isFunctionExpression(first)) return;
      const isAsync =
        ts.canHaveModifiers(first) &&
        (ts.getModifiers(first)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ??
          false);
      if (!isAsync) return;

      const start = first.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "a Promise executor must not be `async`: its rejections are swallowed",
        help: "Make the executor a plain function and call `resolve`/`reject`; do any async work outside or via `.then`/`await` on the constructed promise.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

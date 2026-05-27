import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag the `else` clause that follows a consequent which already terminates
 * control flow (`return` / `throw` / `continue` / `break`). When the `if` branch
 * cannot fall through, the `else` adds nesting without semantic value: the same
 * code reads more directly as an early-return + fall-through pair.
 *
 * Detection (conservative — both signals required):
 *   1. The `IfStatement` has an `elseStatement`.
 *   2. The consequent's last reachable statement is a `return` / `throw` /
 *      `continue` / `break`. A single-statement consequent counts; a `Block`
 *      counts on its final statement.
 *
 * The chained `else if` form (`if (c) return; else if (c2) ...`) fires because
 * `elseStatement` is itself an `IfStatement` — the codebase prefers a flat
 * `if (c) return; if (c2) ...` cascade.
 *
 * Anti-pattern catalog reference:
 *   `opencode-ts/references/style-dna.md` §3 "No-else, early return" + §7.1
 *   "Using `else`".
 */
export const rule = defineRule(
  {
    id: "no-useless-else",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Drop the `else` when the `if` branch returns/throws/continues/breaks — the early return is the contract. Use `else` only when both branches fall through to shared code below.",
  },
  () => ({
    [ts.SyntaxKind.IfStatement]: check,
  }),
);

function check(node: ts.Node, ctx: RuleContext): void {
  if (!ts.isIfStatement(node)) return;
  if (node.elseStatement === undefined) return;
  if (!consequentTerminates(node.thenStatement)) return;

  // Report at the `else` keyword for a clean, navigable diagnostic.
  const elseToken = node
    .getChildren(ctx.sourceFile)
    .find((c) => c.kind === ts.SyntaxKind.ElseKeyword);
  const reportNode = elseToken ?? node.elseStatement;
  const start = reportNode.getStart(ctx.sourceFile);
  const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
  ctx.report({
    filePath: ctx.filePath,
    message:
      "Drop the `else` — the `if` branch already returns/throws/continues/breaks.",
    help: "Replace `if (c) return X; else { Y }` with `if (c) return X; Y`. The early return makes the second case fall through naturally; the `else` only adds nesting.",
    line: line + 1,
    column: character + 1,
  });
}

const TERMINATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.ReturnStatement,
  ts.SyntaxKind.ThrowStatement,
  ts.SyntaxKind.ContinueStatement,
  ts.SyntaxKind.BreakStatement,
]);

function consequentTerminates(stmt: ts.Statement): boolean {
  if (TERMINATORS.has(stmt.kind)) return true;
  if (ts.isBlock(stmt)) {
    const last = stmt.statements[stmt.statements.length - 1];
    return last !== undefined && TERMINATORS.has(last.kind);
  }
  return false;
}

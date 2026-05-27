import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag the `let X; if (c) X = a; else X = b;` shape. A `const X = c ? a : b`
 * names the binding as a fold of a single condition; the `let` form opens a
 * mutation window the rest of the function must reason about and forces the
 * reader to scan two branches to recover the value.
 *
 * Detection (conservative — every signal required to fire):
 *   1. A `let` declaration with EXACTLY one binding, NO initializer, a plain
 *      identifier name (not a destructuring pattern).
 *   2. The IMMEDIATELY-following statement (in the same block / source file) is
 *      an `if` with both `then` and `else` present.
 *   3. Each branch is an `ExpressionStatement` wrapping `X = EXPR`, with `X`
 *      being the same identifier as the `let` binding. Single-statement blocks
 *      are unwrapped before checking; multi-statement blocks are NOT flagged
 *      (they may have side effects that don't fold into a ternary).
 *   4. The else branch is NOT itself an `if` (chained `if/else if/else` is
 *      multi-way assignment, not a binary ternary).
 *
 * Anti-pattern catalog reference:
 *   `opencode-ts/references/style-dna.md` §7.4 "Using `let` when `const` + ternary
 *   works".
 */
export const rule = defineRule(
  {
    id: "prefer-const-ternary",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Replace `let x; if (c) x = a; else x = b;` with `const x = c ? a : b;`. The const + ternary form names the binding as a single expression at the point of declaration; the let-then-assign form opens a mutation window and splits the value across two branches the reader has to merge mentally. Keep `let` when the branches genuinely mutate something else, or when a third assignment site exists.",
  },
  () => ({
    [ts.SyntaxKind.Block]: visit,
    [ts.SyntaxKind.SourceFile]: visit,
    [ts.SyntaxKind.ModuleBlock]: visit,
    [ts.SyntaxKind.CaseClause]: visit,
    [ts.SyntaxKind.DefaultClause]: visit,
  }),
);

function visit(node: ts.Node, ctx: RuleContext): void {
  const statements = getStatements(node);
  if (statements === undefined) return;

  statements.slice(0, -1).forEach((decl, i) => {
    const next = statements[i + 1];
    if (next === undefined) return;
    const name = extractBareLetWithoutInit(decl);
    if (name === undefined) return;
    if (!isBinaryAssignIf(next, name)) return;

    const start = decl.getStart(ctx.sourceFile);
    const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
    ctx.report({
      filePath: ctx.filePath,
      message: `\`let ${name}\` is assigned in both branches of the next \`if\` — fold into \`const ${name} = c ? a : b\`.`,
      help: "Drop the `let` and write `const x = condition ? a : b;` so the binding is initialized once at its declaration.",
      line: line + 1,
      column: character + 1,
    });
  });
}

function getStatements(node: ts.Node): ReadonlyArray<ts.Statement> | undefined {
  if (ts.isBlock(node) || ts.isModuleBlock(node) || ts.isSourceFile(node)) {
    return node.statements;
  }
  if (ts.isCaseOrDefaultClause(node)) return node.statements;
  return undefined;
}

function extractBareLetWithoutInit(stmt: ts.Statement): string | undefined {
  if (!ts.isVariableStatement(stmt)) return undefined;
  const list = stmt.declarationList;
  if ((list.flags & ts.NodeFlags.Let) === 0) return undefined;
  if (list.declarations.length !== 1) return undefined;
  const d = list.declarations[0];
  if (d === undefined) return undefined;
  if (d.initializer !== undefined) return undefined;
  if (!ts.isIdentifier(d.name)) return undefined;
  return d.name.text;
}

function isBinaryAssignIf(stmt: ts.Statement, name: string): boolean {
  if (!ts.isIfStatement(stmt)) return false;
  if (stmt.elseStatement === undefined) return false;
  // Chained `else if` is multi-way assignment, not a binary fold.
  if (ts.isIfStatement(stmt.elseStatement)) return false;
  return (
    branchAssignsTo(stmt.thenStatement, name) &&
    branchAssignsTo(stmt.elseStatement, name)
  );
}

function branchAssignsTo(stmt: ts.Statement, name: string): boolean {
  const body = unwrapSingle(stmt);
  if (!ts.isExpressionStatement(body)) return false;
  const expr = body.expression;
  if (!ts.isBinaryExpression(expr)) return false;
  if (expr.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
  return ts.isIdentifier(expr.left) && expr.left.text === name;
}

function unwrapSingle(stmt: ts.Statement): ts.Statement {
  if (!ts.isBlock(stmt) || stmt.statements.length !== 1) return stmt;
  return stmt.statements[0] ?? stmt;
}

import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";
import type { RuleContext } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag the `Math.random().toString(36|16)` chain: the canonical "fake ID"
 * idiom. `Math.random()` returns a 52-bit double from a non-cryptographic PRNG;
 * formatting it as a base-36 or base-16 string produces IDs that are short,
 * predictable, and collide at non-trivial rates. CWE-330 (Use of Insufficiently
 * Random Values) applies whenever the resulting string is used as a token,
 * session ID, password reset key, file path, or any other identifier whose
 * unpredictability matters.
 *
 * Detection (conservative — the canonical "make a string ID" chain only):
 *   - A `CallExpression` of `<expr>.toString(<arg>)` where `<expr>` is
 *     `Math.random()` and `<arg>` is the numeric literal `36` or `16`.
 *
 * `Math.random()` standing alone is NOT flagged (legitimate uses: jittering,
 * sampling, simulation, animation timing). Only the chain that turns it into a
 * string ID fires.
 *
 * Anti-pattern catalog reference:
 *   `opencode-ts/references/style-dna.md` §7 "Using `Math.random()` for IDs".
 */
export const rule = defineRule(
  {
    id: "no-math-random-for-id",
    severity: "warning",
    category: "Security",
    tier: "SYN",
    fixKind: "manual",
    tags: ["security"],
    recommendation:
      "Don't use `Math.random().toString(36)` for IDs — `Math.random()` is a non-cryptographic PRNG and the base-36/16 string is short, predictable, and prone to collisions (CWE-330). Use `crypto.randomUUID()` for opaque IDs or `crypto.randomBytes(n).toString('hex')` for arbitrary-length tokens. The need only goes away when the ID is for a non-security purpose AND a real uniqueness guarantee (DB sequence, ULID, snowflake) is already in place.",
  },
  () => ({
    [ts.SyntaxKind.CallExpression]: check,
  }),
);

const ID_BASES = new Set<number>([36, 16]);

function check(node: ts.Node, ctx: RuleContext): void {
  if (!ts.isCallExpression(node)) return;
  if (!ts.isPropertyAccessExpression(node.expression)) return;
  if (node.expression.name.text !== "toString") return;

  if (!isMathRandomCall(node.expression.expression)) return;
  if (!hasIdBaseArg(node.arguments)) return;

  const start = node.getStart(ctx.sourceFile);
  const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
  ctx.report({
    filePath: ctx.filePath,
    message:
      "`Math.random().toString(36|16)` is the fake-ID idiom — non-cryptographic, predictable, collision-prone (CWE-330).",
    help: "Use `crypto.randomUUID()` for opaque IDs or `crypto.randomBytes(n).toString('hex')` for arbitrary-length tokens.",
    line: line + 1,
    column: character + 1,
  });
}

function isMathRandomCall(expr: ts.Expression): boolean {
  if (!ts.isCallExpression(expr)) return false;
  if (expr.arguments.length !== 0) return false;
  const callee = expr.expression;
  // `Math.random()` — dotted property access.
  if (ts.isPropertyAccessExpression(callee)) {
    if (callee.name.text !== "random") return false;
    return ts.isIdentifier(callee.expression) && callee.expression.text === "Math";
  }
  // `Math["random"]()` — bracket-notation form (minifier / codegen output).
  if (ts.isElementAccessExpression(callee)) {
    const arg = callee.argumentExpression;
    if (!ts.isStringLiteral(arg)) return false;
    if (arg.text !== "random") return false;
    return ts.isIdentifier(callee.expression) && callee.expression.text === "Math";
  }
  return false;
}

function hasIdBaseArg(args: ts.NodeArray<ts.Expression>): boolean {
  if (args.length !== 1) return false;
  const a = args[0];
  if (a === undefined) return false;
  if (!ts.isNumericLiteral(a)) return false;
  return ID_BASES.has(Number(a.text));
}

import ts from "typescript";
import { defineRule } from "../../define-rule.js";
import type { RuleContext } from "../../define-rule.js";

/**
 * SYN — flag a hard-coded insecure `http://` URL. Plain HTTP is transmitted in
 * the clear: it is open to interception and tampering. Loopback hosts
 * (`localhost` / `127.0.0.1`) are exempt — local dev traffic never leaves the
 * machine. AST-only: inspect string-literal text; no checker needed.
 */
const INSECURE = /^http:\/\//i;
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1)/i;

function check(node: ts.Node, text: string, ctx: RuleContext): void {
  if (!INSECURE.test(text)) return;
  if (LOOPBACK.test(text)) return;

  const start = node.getStart(ctx.sourceFile);
  const { line, character } =
    ctx.sourceFile.getLineAndCharacterOfPosition(start);
  ctx.report({
    filePath: ctx.filePath,
    message: "Insecure `http://` URL; use `https://`.",
    help: "Switch to `https://` so the request is encrypted in transit. Loopback hosts (localhost / 127.0.0.1) are exempt.",
    line: line + 1,
    column: character + 1,
  });
}

export const rule = defineRule(
  {
    id: "no-insecure-url",
    severity: "warning",
    category: "Security",
    tier: "SYN",
    fixKind: "manual",
    tags: ["security"],
    recommendation:
      "Use `https://` for remote URLs; plain `http://` is sent in the clear and open to interception. Loopback hosts are exempt.",
  },
  () => ({
    [ts.SyntaxKind.StringLiteral]: (node, ctx) => {
      if (!ts.isStringLiteral(node)) return;
      check(node, node.text, ctx);
    },
    [ts.SyntaxKind.NoSubstitutionTemplateLiteral]: (node, ctx) => {
      if (!ts.isNoSubstitutionTemplateLiteral(node)) return;
      check(node, node.text, ctx);
    },
  }),
);

import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";
import type { RuleContext } from "@ts-doctor/rules-core-effect";

/**
 * Conservative credential shapes. Each is anchored on a vendor-specific prefix
 * plus the vendor's fixed token length, so random prose won't match. We
 * deliberately avoid generic high-entropy heuristics (false-positive prone).
 *
 * FROZEN vendor-anchored patterns (RULE-025) — preserved VERBATIM from legacy
 * `packages/ts-doctor-rules/src/rules/security/no-secrets-in-source.ts`. Do not
 * "improve" these; they are the equivalence anchor.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bghp_[A-Za-z0-9]{36}\b/, // GitHub personal access token
  /\bsk_live_[A-Za-z0-9]{16,}\b/, // Stripe live secret key
];

/**
 * SYN — flag string / template literals whose text matches a known credential
 * shape (AWS key, GitHub token, Stripe live key). AST-only; inspects literal
 * text, never resolves types.
 */
export const rule = defineRule(
  {
    id: "no-secrets-in-source",
    severity: "error",
    category: "Security",
    tier: "SYN",
    fixKind: "manual",
    tags: ["security"],
    recommendation:
      "Don't hardcode secrets. Load them from environment variables or a secrets manager, and rotate any credential already committed.",
  },
  () => {
    const check = (
      node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
      ctx: RuleContext,
    ): void => {
      if (!SECRET_PATTERNS.some((re) => re.test(node.text))) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "possible hardcoded secret",
        help: "Move the credential to an environment variable or secrets manager, and rotate it.",
        line: line + 1,
        column: character + 1,
      });
    };

    return {
      [ts.SyntaxKind.StringLiteral]: (node, ctx) => {
        if (!ts.isStringLiteral(node)) return;
        check(node, ctx);
      },
      [ts.SyntaxKind.NoSubstitutionTemplateLiteral]: (node, ctx) => {
        if (!ts.isNoSubstitutionTemplateLiteral(node)) return;
        check(node, ctx);
      },
    };
  },
);

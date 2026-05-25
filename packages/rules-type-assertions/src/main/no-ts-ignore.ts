import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag `// @ts-ignore` directive comments.
 *
 * Real Tier-1 rule: scans the source text for `@ts-ignore` comment directives
 * (no checker needed). `@ts-ignore` silences the compiler unconditionally,
 * including for unrelated errors that drift onto the line later; prefer
 * `@ts-expect-error` (errors when the suppression is no longer needed) or a
 * real fix. Manual fix only.
 */
export const rule = defineRule(
  {
    id: "no-ts-ignore",
    severity: "warning",
    category: "Type Assertions & Escapes",
    tier: "SYN",
    fixKind: "manual",
    tags: ["escape-hatch"],
    recommendation:
      "Replace `@ts-ignore` with `@ts-expect-error` (so the suppression self-removes when no longer needed) or fix the underlying type error.",
  },
  // We attach to the SourceFile node and scan its full text once. Comments are
  // trivia, not nodes, so a syntax-kind keyed visitor over SourceFile is the
  // cleanest hook for a comment-directive rule.
  () => ({
    [ts.SyntaxKind.SourceFile]: (node, ctx) => {
      if (!ts.isSourceFile(node)) return;
      const text = node.getFullText();
      const re = /\/\/\s*@ts-ignore\b/g;
      let match: RegExpExecArray | null = re.exec(text);
      while (match !== null) {
        const pos = node.getLineAndCharacterOfPosition(match.index);
        ctx.report({
          filePath: ctx.filePath,
          message: "Avoid `@ts-ignore`; it silences the compiler unconditionally.",
          help: "Use `@ts-expect-error` or fix the underlying type error.",
          line: pos.line + 1,
          column: pos.character + 1,
        });
        match = re.exec(text);
      }
    },
  }),
);

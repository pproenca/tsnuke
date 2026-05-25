import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

// A `// @ts-expect-error` line-comment with nothing meaningful after it.
// Anchored to line start to avoid matching inside string literals.
const BARE = /^[ \t]*\/\/[ \t]*@ts-expect-error[ \t]*$/gm;

/**
 * SYN — require every `@ts-expect-error` to carry a description (a reason after
 * the directive), so suppressions are self-documenting and reviewable.
 */
export const rule = defineRule(
  {
    id: "ts-expect-error-requires-description",
    severity: "warning",
    category: "Type Assertions & Escapes",
    tier: "SYN",
    fixKind: "manual",
    tags: ["escape-hatch"],
    recommendation:
      "Add a reason after the directive, e.g. `// @ts-expect-error -- upstream types are wrong (see #123)`.",
  },
  () => ({
    [ts.SyntaxKind.SourceFile]: (node, ctx) => {
      if (!ts.isSourceFile(node)) return;
      const text = node.getFullText();
      BARE.lastIndex = 0;
      let match: RegExpExecArray | null = BARE.exec(text);
      while (match !== null) {
        const { line, character } = node.getLineAndCharacterOfPosition(match.index);
        ctx.report({
          filePath: ctx.filePath,
          message: "`@ts-expect-error` has no description.",
          help: "Append a reason after the directive (e.g. `-- why this is expected`).",
          line: line + 1,
          column: character + 1,
        });
        match = BARE.exec(text);
      }
    },
  }),
);

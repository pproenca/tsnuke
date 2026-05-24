import ts from "typescript";
import { defineRule } from "../../define-rule.js";

/**
 * SYN — flag `const enum`. Google TS Style Guide: "Code must not use
 * `const enum`; use plain `enum` instead." A `const enum` is inlined at every
 * use site and erased from the output, so its values disappear for JS consumers
 * of the module — and it outright breaks under `isolatedModules` /
 * `verbatimModuleSyntax` (single-file transpilers like Babel/swc/esbuild can't
 * see the member values to inline). An inlining/erasure footgun.
 *
 * NOTE: overlaps with `prefer-union-over-enum` (which flags ALL enums as a
 * warning). This rule is the stronger, narrower, error-level concern: even teams
 * that accept plain enums must not use `const enum`.
 */
export const rule = defineRule(
  {
    id: "no-const-enum",
    severity: "error",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "auto-fix",
    tags: ["ts-idiom"],
    recommendation:
      "Drop `const` from the enum declaration. `const enum` is inlined and erased — its values vanish for JS consumers and it breaks under `isolatedModules` / `verbatimModuleSyntax` (Babel, swc, esbuild). Use a plain `enum`, or better a string-literal union.",
  },
  () => ({
    [ts.SyntaxKind.EnumDeclaration]: (node, ctx) => {
      if (!ts.isEnumDeclaration(node)) return;
      const isConst = (node.modifiers ?? []).some(
        (m) => m.kind === ts.SyntaxKind.ConstKeyword,
      );
      if (!isConst) return;

      const start = node.name.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `\`const enum ${node.name.text}\` is banned; use a plain \`enum\` (or a literal union).`,
        help: "Remove `const`. `const enum` is inlined/erased and breaks single-file transpilation under `isolatedModules` / `verbatimModuleSyntax`.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);

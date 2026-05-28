import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * SYN — flag an object-shape `type X = { ... }` alias that Google says should be
 * an `interface`. Google TS Style Guide: "when declaring types for objects, use
 * interfaces instead of a type alias for the object literal expression."
 * Interfaces give better error messages, support declaration merging / `extends`,
 * and read as a nominal-ish contract.
 *
 * Deliberately conservative — fires ONLY when the alias RHS is a single object
 * `TypeLiteral`. Aliases whose RHS is a union, intersection, mapped type,
 * function type, tuple, conditional, indexed access, or a bare reference are NOT
 * flagged: those legitimately can't (or shouldn't) be interfaces.
 *
 * NOTE: the now-retired `prefer-interface-for-large-object-type` (RULE-010) was a
 * size-gated subset of this rule (fired only on >12-member aliases) and is gone as
 * of the 2026-05-28 catalog audit — keeping both produced duplicate findings on the
 * same alias. Tagged `convention` so users can opt out the whole style family with
 * `config.ignore.tags: ["convention"]`.
 */

export const rule = defineRule(
  {
    id: "consistent-type-definitions",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "codemod",
    tags: ["convention"],
    recommendation:
      "Declare object shapes with `interface X { ... }` rather than `type X = { ... }`. Interfaces give clearer errors, support `extends` and declaration merging, and signal an object contract. Keep `type` for unions, intersections, mapped/conditional types, tuples, and function types.",
  },
  () => ({
    [ts.SyntaxKind.TypeAliasDeclaration]: (node, ctx) => {
      if (!ts.isTypeAliasDeclaration(node)) return;
      const t = node.type;
      // Only a single object TypeLiteral on the RHS — nothing else qualifies.
      // A mapped type (`{ [K in U]: V }`) parses as a MappedTypeNode, not a
      // TypeLiteralNode, so it is already excluded here.
      if (!ts.isTypeLiteralNode(t)) return;
      // An empty `type X = {}` is the `{}`-type smell, handled elsewhere; skip.
      if (t.members.length === 0) return;

      const start = node.name.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      // P4 codemod: rewrite `type X = { … }` as `interface X { … }`. Splice the
      // entire span from the first modifier (or `type` keyword) up to the body's
      // `{` with the equivalent `[modifiers ]interface X[<generics>] ` prefix,
      // preserving `export` / `declare` etc. A trailing `;` after `}` (legal in
      // alias form, harmless after `interface`) is left in place.
      const declStart = node.getStart(ctx.sourceFile);
      const bodyStart = node.type.getStart(ctx.sourceFile);
      const modifiersText = (ts.getModifiers(node) ?? [])
        .map((m) => m.getText(ctx.sourceFile))
        .join(" ");
      const typeParamsText =
        node.typeParameters !== undefined && node.typeParameters.length > 0
          ? `<${node.typeParameters.map((p) => p.getText(ctx.sourceFile)).join(", ")}>`
          : "";
      const prefix = modifiersText.length > 0 ? `${modifiersText} ` : "";
      ctx.report({
        filePath: ctx.filePath,
        message: `Object-shape alias \`type ${node.name.text} = { ... }\` should be an \`interface\`.`,
        help: `Rewrite as \`interface ${node.name.text} { ... }\`. Interfaces give better errors and support \`extends\` / declaration merging.`,
        line: line + 1,
        column: character + 1,
        fix: {
          kind: "codemod",
          edits: [
            {
              start: declStart,
              end: bodyStart,
              replacement: `${prefix}interface ${node.name.text}${typeParamsText} `,
            },
          ],
        },
      });
    },
  }),
);

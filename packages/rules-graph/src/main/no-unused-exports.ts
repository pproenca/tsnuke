import { defineGraphRule } from "@ts-fix/rules-core-effect";

/**
 * GRAPH — flag an exported name that no other in-project module imports (RULE-025,
 * dead-code row).
 *
 * Gated to `app` projects (`requires:["app"]`): libraries export for external
 * consumers, so unused-internally exports are expected there. (Activation gating is
 * the engine / `shouldActivate`'s job — RULE-019; the `analyze` body below does NOT
 * re-check it.) Conservative:
 *   - only files that ARE imported by something are considered (an unreferenced
 *     file is a root/entry — that's `no-unused-files` territory, not this rule);
 *   - files that are namespace/wildcard/dynamically used are exempt (we can't
 *     statically attribute individual names);
 *   - a name is flagged only when NO importer imports it by name.
 *
 * Ported VERBATIM from legacy
 * `packages/ts-fix-rules/src/rules/dead-code/no-unused-exports.ts`; the only change is
 * importing `defineGraphRule` from the `@ts-fix/rules-core-effect` substrate rather than
 * the legacy `../../define-rule.js`. The referenced/wildcard/usedExports conservative
 * logic, the META (`requires:["app"]`), and the message/help text are unchanged.
 */
export const rule = defineGraphRule(
  {
    id: "no-unused-exports",
    severity: "warning",
    category: "Dead Code & Unused Exports",
    tier: "GRAPH",
    requires: ["app"],
    fixKind: "manual",
    tags: ["dead-code"],
    recommendation:
      "Remove the unused export (and the symbol if nothing uses it), or, if it is a public entry point, move it to the package's declared entry.",
  },
  (ctx) => {
    const { files, imports, exports, usedExports, wildcardUsed } = ctx.graph;

    // Files referenced (imported) by at least one other module.
    const referenced = new Set([...imports.values()].flat());

    for (const file of files) {
      if (!referenced.has(file)) continue; // root/entry — skip.
      if (wildcardUsed.has(file)) continue; // all exports counted as used.
      const exp = exports.get(file) ?? [];
      const used = usedExports.get(file) ?? new Set<string>();
      for (const name of exp) {
        if (used.has(name)) continue;
        ctx.report({
          filePath: file,
          message: `Exported \`${name}\` is never imported by another module.`,
          help: "Remove the unused export, or relocate it to the package's public entry point.",
          line: 1,
          column: 1,
        });
      }
    }
  },
);

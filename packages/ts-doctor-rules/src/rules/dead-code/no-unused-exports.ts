import { defineGraphRule } from "../../define-rule.js";

/**
 * GRAPH — flag an exported name that no other in-project module imports.
 *
 * Gated to `app` projects (`requires:["app"]`): libraries export for external
 * consumers, so unused-internally exports are expected there. Conservative:
 *   - only files that ARE imported by something are considered (an unreferenced
 *     file is a root/entry — that's `no-unused-files` territory, not this rule);
 *   - files that are namespace/wildcard/dynamically used are exempt (we can't
 *     statically attribute individual names);
 *   - a name is flagged only when NO importer imports it by name.
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
    const referenced = new Set<string>();
    for (const [, targets] of imports) {
      for (const t of targets) referenced.add(t);
    }

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

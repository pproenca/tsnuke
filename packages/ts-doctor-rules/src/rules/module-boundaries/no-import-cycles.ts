import { defineGraphRule } from "../../define-rule.js";

/**
 * GRAPH — flag circular import dependencies between modules.
 *
 * A GRAPH-tier rule: it analyzes the cross-file {@link ModuleGraph} core builds
 * (resolved in-project import edges), not a single file's AST. Cycles are found
 * with an iterative DFS that records the back-edge target of each cycle; each
 * file that participates in a cycle is reported once (at line 1).
 */
export const rule = defineGraphRule(
  {
    id: "no-import-cycles",
    severity: "error",
    category: "Module Boundaries & Architecture",
    tier: "GRAPH",
    fixKind: "manual",
    tags: ["architecture"],
    recommendation:
      "Break the cycle: extract the shared code into a third module, or invert one of the dependencies (depend on an interface, not a concretion).",
  },
  (ctx) => {
    const { files, imports } = ctx.graph;
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    const reported = new Set<string>();

    const visit = (start: string): void => {
      // Iterative DFS (explicit stack) to avoid deep recursion on large graphs.
      const stack: { file: string; depIndex: number }[] = [{ file: start, depIndex: 0 }];
      color.set(start, GRAY);
      while (stack.length > 0) {
        const frame = stack[stack.length - 1]!;
        const deps = imports.get(frame.file) ?? [];
        if (frame.depIndex < deps.length) {
          const dep = deps[frame.depIndex]!;
          frame.depIndex++;
          const c = color.get(dep) ?? WHITE;
          if (c === GRAY) {
            // Back-edge → `dep` closes a cycle. Report it once.
            if (!reported.has(dep)) {
              reported.add(dep);
              ctx.report({
                filePath: dep,
                message: `Import cycle detected involving ${dep}.`,
                help: "Circular imports cause fragile init order and break tree-shaking. Extract shared code or invert a dependency.",
                line: 1,
                column: 1,
              });
            }
          } else if (c === WHITE) {
            color.set(dep, GRAY);
            stack.push({ file: dep, depIndex: 0 });
          }
        } else {
          color.set(frame.file, BLACK);
          stack.pop();
        }
      }
    };

    for (const file of files) {
      if ((color.get(file) ?? WHITE) === WHITE) visit(file);
    }
  },
);

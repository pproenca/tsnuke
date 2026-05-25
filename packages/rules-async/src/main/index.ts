/**
 * `@ts-doctor/rules-async-effect` — the `async` rule category (7 rules: 4 SYN + 3 TYP).
 *
 * Pure AST / type-aware predicates that plug into the `@ts-doctor/rules-core-effect`
 * substrate (`defineRule` + the per-file `SyntaxKind → visitor` shape). The engine drives
 * the SYN rules via the same walk/dispatch as `runRule`, and the TYP rules via
 * `runTypeAwareRule` (which supplies a live `ts.TypeChecker` on the `typecheck:ok` path):
 *
 *   SYN (Tier-1, AST-only — always available):
 *     - {@link noAsyncPromiseExecutor} — `new Promise(async …)` swallows rejections.
 *     - {@link noAwaitInLoop} — `await` directly inside a loop serializes iterations.
 *     - {@link noReturnAwait} — redundant `return await` (except inside a `try`).
 *     - {@link requireAwait} — `async` function whose body never awaits.
 *
 *   TYP (Tier-2, type-aware — `requires:["typecheck:ok"]`, early-return without a checker):
 *     - {@link awaitThenable} — `await` on a non-thenable operand (a no-op).
 *     - {@link noFloatingPromises} — an unhandled Promise expression statement. The ONLY
 *       rule in the whole catalog that emits a real `fix` (RULE-025): `kind:"auto-fix"`
 *       + a zero-width edit inserting `void ` + the checker-inferred type (BC-14).
 *     - {@link noMisusedPromises} — a Promise used directly as a boolean condition.
 *
 * The substrate (`defineRule`/`runRule`/`runTypeAwareRule`/`Rule`/`RuleContext`) is imported
 * from `@ts-doctor/rules-core-effect`; the data contracts (`Diagnostic`/`RuleMeta`/`Fix`/
 * `TextEdit`) live in `@ts-doctor/contracts-effect`. This slice does NOT re-export either's
 * symbols (barrel hygiene — it publishes only what it owns: the seven rules + the category
 * registry). See TRANSFORMATION_NOTES.md for the legacy → target mapping.
 */

import type { Rule } from "@ts-doctor/rules-core-effect";

// SYN (Tier-1, AST-only).
import { rule as noAsyncPromiseExecutor } from "./no-async-promise-executor.js";
import { rule as noAwaitInLoop } from "./no-await-in-loop.js";
import { rule as noReturnAwait } from "./no-return-await.js";
import { rule as requireAwait } from "./require-await.js";

// TYP (Tier-2, type-aware — gated on `typecheck:ok`).
import { rule as awaitThenable } from "./await-thenable.js";
import { rule as noFloatingPromises } from "./no-floating-promises.js";
import { rule as noMisusedPromises } from "./no-misused-promises.js";

// The seven rules, exported by stable name.
export {
  noAsyncPromiseExecutor,
  noAwaitInLoop,
  noReturnAwait,
  requireAwait,
  awaitThenable,
  noFloatingPromises,
  noMisusedPromises,
};

/**
 * The `async` category registry (RULE-025 async row): 4 SYN + 3 TYP. The full-catalog
 * codegen (legacy `scripts/generate-rule-registry.mjs`) folds these into the global
 * `ruleRegistry`; here the list is hand-written, mirroring the v1 manual-registry seam
 * in rules-core. The engine reads each rule's `tier`/`requires` to decide whether to run
 * it on the SYN path or only under `typecheck:ok` (the three TYP rules).
 */
export const asyncRules: ReadonlyArray<Rule> = [
  noAsyncPromiseExecutor,
  noAwaitInLoop,
  noReturnAwait,
  requireAwait,
  awaitThenable,
  noFloatingPromises,
  noMisusedPromises,
];

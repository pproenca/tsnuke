/**
 * In-process scale guard (C4 scale model, BC-24, §4.2/§4.3).
 *
 * WHY NOT THE LEGACY BINARY-SPLIT:
 *   react-doctor's `ceil(len/2)` batch + binary-split (BC-24) recovered from an
 *   **oxlint subprocess**'s argv-length cap and per-spawn OOM. With an in-process
 *   `ts.Program` there is no argv cap and files aren't fed in batches, so
 *   binary-splitting the input list is a NO-OP against the real failure mode,
 *   which is now **Program memory**. The split is retained ONLY if a `tsgolint`
 *   subprocess path is ever reintroduced (§8) — it is not part of in-process v1.
 *
 * THE REAL v1 LEVERS:
 *   - Per-project Program built and DISPOSED sequentially — never hold N
 *     Programs resident (§4.3, the monorepo memory fix).
 *   - Memory ceiling → graceful Tier-2 skip with `scorePartial=true` rather than
 *     crash (§4.2).
 *
 * RESOURCE LIFECYCLE (Effect dropped — §1.5):
 *   Effect used to manage resource disposal. We do it by hand via the
 *   `using` / `Symbol.dispose` convention (TS 5.2+). One small `Disposable`
 *   helper covers the three resources Effect held: the `ts.Program` (pins
 *   memory until dropped), temp files (atomic-private-write), and git
 *   subprocesses (kill-on-timeout).
 *
 * See REIMAGINED_ARCHITECTURE.md §1.5 / §4.2 / §4.3 and AI_NATIVE_SPEC.md BC-24.
 */

/**
 * The well-known `Symbol.dispose` (TS 5.2+ / `using`). Resolved at runtime with
 * a fallback so this module compiles under an ES2023 `lib` (which predates
 * `esnext.disposable`) without augmenting the global `SymbolConstructor`.
 */
const DISPOSE: symbol =
  (Symbol as { dispose?: symbol }).dispose ?? Symbol.for("Symbol.dispose");

/**
 * A resource whose cleanup runs when it leaves a `using` scope. Structurally a
 * lib `Disposable` — the `[Symbol.dispose]()` method is present at runtime — but
 * typed via an explicit `dispose()` method so it compiles without the
 * `esnext.disposable` lib. Callers on TS 5.2+ with the right lib can still use
 * it with the `using` keyword.
 */
export interface DisposableResource<T> {
  readonly value: T;
  /** Run cleanup. Idempotent. Also installed under `Symbol.dispose` at runtime. */
  dispose(): void;
}

/**
 * Wrap a value + its cleanup into a {@link DisposableResource}. The returned
 * object also carries `[Symbol.dispose]` so it works with `using` where the lib
 * supports it; otherwise call `.dispose()` (or use {@link withDisposableProgram}).
 *
 * @example
 *   const held = withDisposable(buildProgram(cfg), (p) => p.dispose?.());
 *   try { analyze(held.value); } finally { held.dispose(); }
 */
export function withDisposable<T>(
  value: T,
  dispose: (value: T) => void,
): DisposableResource<T> {
  let disposed = false;
  const doDispose = (): void => {
    if (disposed) return;
    disposed = true;
    dispose(value);
  };
  const resource: DisposableResource<T> = { value, dispose: doDispose };
  // Install the well-known dispose symbol so `using` works where lib supports it.
  Object.defineProperty(resource, DISPOSE, {
    value: doDispose,
    enumerable: false,
  });
  return resource;
}

/**
 * Run `fn` with a Program built for `key`, disposing it before returning —
 * the per-project sequential-build-and-dispose guard (§4.3, BC-24). Disposal is
 * guaranteed via `finally` even if `fn` throws, so a Program never lingers into
 * the next project's build (the monorepo memory fix).
 *
 * The Program build/dispose are injected so this orchestration is testable
 * without a real `ts.Program`. In production, `build` is `ts.createProgram(...)`
 * and `dispose` drops the reference (and any builder host) so memory is released
 * before the next project's Program is constructed.
 *
 * PENDING: wire `build` to a real `ts.createProgram` over the resolved tsconfig
 * file set (§4.1); today a typed seam + caller-supplied build/dispose is enough.
 */
export function withDisposableProgram<TProgram, TResult>(
  key: string,
  build: (key: string) => TProgram,
  dispose: (program: TProgram) => void,
  fn: (program: TProgram) => TResult,
): TResult {
  const held = withDisposable(build(key), dispose);
  try {
    return fn(held.value);
  } finally {
    held.dispose();
  }
}

/**
 * Default memory ceiling (bytes) above which Tier-2 is skipped to degrade
 * gracefully rather than OOM (§4.2). Tunable by the caller; not a frozen constant
 * (unlike the score weights) because it's an environment limit, not a scoring rule.
 */
export const DEFAULT_TIER2_MEMORY_CEILING_BYTES = 2_000_000_000; // ~2 GiB

/**
 * Decide whether Tier-2 should be skipped under memory pressure (§4.2).
 * Returns true (skip Tier-2, set `scorePartial=true`) when the current RSS plus
 * an estimated Program cost would exceed the ceiling.
 *
 * `currentRssBytes` is injected for determinism/testability (no `process` read here).
 */
export function shouldSkipTier2ForMemory(
  currentRssBytes: number,
  estimatedProgramBytes: number,
  ceilingBytes: number = DEFAULT_TIER2_MEMORY_CEILING_BYTES,
): boolean {
  return currentRssBytes + estimatedProgramBytes > ceilingBytes;
}

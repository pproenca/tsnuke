/**
 * Cross-cutting progress contract — used by the engine (emit) and the format
 * slice (render). Lives in `@tsnuke/contracts-effect` so neither slice depends
 * on the other.
 *
 * The engine calls `onProgress` synchronously at phase boundaries. Each `*-end`
 * event carries `elapsedMs` for that phase; `*-start`/header events carry the
 * inputs the renderer needs (counts, directory). Adding a new event kind is
 * additive — renderers that don't know about it can default to a noop branch.
 */

/** A single phase-level event emitted by the engine as a run progresses. */
export type ProgressEvent =
  | { readonly kind: "project-start"; readonly index: number; readonly total: number; readonly directory: string }
  | { readonly kind: "discovered"; readonly directory: string; readonly elapsedMs: number }
  | { readonly kind: "reading-files"; readonly count: number; readonly elapsedMs: number }
  | { readonly kind: "building-program"; readonly elapsedMs: number; readonly typecheckOk: boolean }
  | { readonly kind: "program-skipped"; readonly reason: string }
  | { readonly kind: "tier-1"; readonly rules: number; readonly files: number; readonly elapsedMs: number }
  | { readonly kind: "tier-2"; readonly rules: number; readonly files: number; readonly elapsedMs: number }
  | { readonly kind: "tier-2-skipped"; readonly reason: string }
  | { readonly kind: "graph"; readonly rules: number; readonly elapsedMs: number }
  | { readonly kind: "scoring"; readonly score: number | null; readonly partial: boolean }
  | { readonly kind: "done"; readonly elapsedMs: number };

/** A sink for {@link ProgressEvent}s — called synchronously by the engine. */
export type OnProgress = (event: ProgressEvent) => void;

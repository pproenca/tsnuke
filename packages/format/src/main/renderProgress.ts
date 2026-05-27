/**
 * Progress event → terminal line (pure). The engine emits a {@link ProgressEvent}
 * stream at phase boundaries (discover, read, build, tier-1, tier-2, graph, score,
 * done) and `diagnoseWorkspace` adds `project-start` headers; the CLI converts
 * each event into one line of stderr output via this formatter.
 *
 * Style: a leading `·` bullet, dim text, lowercase ("done" / "skipped"). Each line
 * is self-contained — the CLI writes them one after another, so the user sees the
 * run progress instead of staring at a blank terminal until the report appears.
 *
 *   · discovering project… done (8ms)
 *   · reading 124 files… done (42ms)
 *   · building TS program… done (1.2s, typecheck=ok)
 *   · tier-1: SYN+CFG ×75 over 124 files… done (0.4s)
 *   · tier-2: TYP ×18 over 124 files… done (1.8s)
 *   · graph: 2 rule(s)… done (12ms)
 *   · scoring → 84/100
 */

import type { ProgressEvent } from "@tsnuke/contracts-effect";
import { dim, formatDuration } from "./theme.js";

/** Options for {@link renderProgressLine}. */
export interface RenderProgressOptions {
  /** ANSI colour on/off (the CLI decides — non-TTY/`NO_COLOR` → off). */
  readonly color: boolean;
}

/**
 * Map a {@link ProgressEvent} to ONE line of stderr text (no trailing newline —
 * the caller appends it). Pure: no IO. The `project-start` event is the only one
 * NOT prefixed with `·` — it renders as an indented header so workspace runs
 * read as "header + phases + header + phases" naturally.
 */
export function renderProgressLine(event: ProgressEvent, options: RenderProgressOptions): string {
  const { color } = options;
  switch (event.kind) {
    case "project-start": {
      const header = `[${event.index}/${event.total}] ${event.directory}`;
      return dim(color, header);
    }
    case "discovered":
      return dim(color, `  · discovering project… done (${formatDuration(event.elapsedMs)})`);
    case "reading-files": {
      const noun = event.count === 1 ? "file" : "files";
      return dim(color, `  · reading ${event.count} ${noun}… done (${formatDuration(event.elapsedMs)})`);
    }
    case "building-program": {
      const tc = event.typecheckOk ? "typecheck=ok" : "typecheck=fail";
      return dim(color, `  · building TS program… done (${formatDuration(event.elapsedMs)}, ${tc})`);
    }
    case "program-skipped":
      return dim(color, `  · TS program: skipped (${event.reason})`);
    case "tier-1": {
      const noun = event.files === 1 ? "file" : "files";
      return dim(color, `  · tier-1: SYN+CFG ×${event.rules} over ${event.files} ${noun}… done (${formatDuration(event.elapsedMs)})`);
    }
    case "tier-2": {
      const noun = event.files === 1 ? "file" : "files";
      return dim(color, `  · tier-2: TYP ×${event.rules} over ${event.files} ${noun}… done (${formatDuration(event.elapsedMs)})`);
    }
    case "tier-2-skipped":
      return dim(color, `  · tier-2: skipped (${event.reason})`);
    case "graph": {
      const noun = event.rules === 1 ? "rule" : "rules";
      return dim(color, `  · graph: ${event.rules} ${noun}… done (${formatDuration(event.elapsedMs)})`);
    }
    case "scoring": {
      const score = event.score === null ? "n/a" : `${event.score}/100`;
      const partial = event.partial ? " (partial)" : "";
      return dim(color, `  · scoring → ${score}${partial}`);
    }
    case "done":
      return dim(color, `  · done (${formatDuration(event.elapsedMs)})`);
  }
}

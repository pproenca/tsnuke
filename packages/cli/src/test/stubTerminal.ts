/**
 * A CAPTURING `Terminal` Layer for end-to-end CLI tests — records every `display(text)`
 * into an array instead of writing to the real process stdout, so a full `run(argv)` can
 * be asserted on. Merged with the REAL Node `FileSystem` + `Path` Layers (a real temp TS
 * project on disk), it provides the full `CliApp.Environment` (`FileSystem | Path |
 * Terminal`) the `@effect/cli` runner requires — without spawning a process.
 */

import { FileSystem, Path, Terminal } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer } from "effect";

interface CapturedTerminal {
  readonly layer: Layer.Layer<Terminal.Terminal>;
  readonly output: string[];
}

/** The full e2e environment Layer type: capturing Terminal + real FileSystem + Path. */
interface CapturedEnv {
  readonly layer: Layer.Layer<Terminal.Terminal | FileSystem.FileSystem | Path.Path>;
  readonly output: string[];
}

/** Build a capturing Terminal layer + the buffer it writes into. */
const makeCapturedTerminal = (): CapturedTerminal => {
  const output: string[] = [];
  const terminal: Terminal.Terminal = {
    columns: Effect.succeed(80),
    rows: Effect.succeed(24),
    isTTY: Effect.succeed(false),
    // readInput / readLine are unused by the inspect/install handlers.
    readInput: Effect.die("readInput not supported in tests") as Terminal.Terminal["readInput"],
    readLine: Effect.die("readLine not supported in tests") as Terminal.Terminal["readLine"],
    display: (text: string) => Effect.sync(() => void output.push(text)),
  };
  return { layer: Layer.succeed(Terminal.Terminal, terminal), output };
};

/**
 * The full end-to-end environment Layer: a capturing Terminal + the REAL Node FileSystem
 * + Path (so `diagnoseNode`/`applyFixesToFilesNode` run against the temp dir on disk).
 */
export const e2eLayer = (): CapturedEnv => {
  const captured = makeCapturedTerminal();
  return {
    output: captured.output,
    layer: Layer.mergeAll(captured.layer, NodeFileSystem.layer, NodePath.layer),
  };
};

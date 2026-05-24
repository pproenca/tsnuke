import { b } from "./b.js";

// no-import-cycles (GRAPH): a → b → a.
export function a(): number {
  return b() + 1;
}

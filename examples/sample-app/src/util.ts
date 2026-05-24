export function used(): number {
  return 1;
}

// no-unused-exports (GRAPH, app-gated): nothing imports this.
export function unusedHelper(): number {
  return 2;
}

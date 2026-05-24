import { used } from "./util.js";

// prefer-union-over-enum (SYN)
export enum Color {
  Red,
  Green,
}

// no-default-export (SYN)
export default function run(): void {
  const value: any = used(); // no-explicit-any (SYN)
  const doubled = value as unknown as number; // no-double-assertion (SYN)
  doSomethingAsync(); // no-floating-promises (TYP)
  console.log(Color.Red, doubled);
}

async function doSomethingAsync(): Promise<void> {
  await Promise.resolve();
}

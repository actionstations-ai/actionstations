/* eslint-disable @typescript-eslint/no-explicit-any -- loose types for the scripts under test */
// Types for scripts/bench/mini/run.mjs (tests/scripts/bench-mini.test.ts).
export function parseMiniArgs(argv: string[]): any
export function lmsCommands(
  model: { name: string },
  contextLength: number,
): Record<string, string[]>
export function manageModel(
  model: { name: string; tool: string },
  contextLength: number,
  opts: { load: boolean; exec?: (args: string[]) => void },
): { done: () => void }

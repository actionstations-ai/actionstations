/* eslint-disable @typescript-eslint/no-explicit-any -- loose types for the scripts under test */
// Types for scripts/bench/mini/replay.mjs (tests/scripts/bench-mini.test.ts).
export function replayMiniRun(
  old: any,
  workDir: string,
  suite: any,
  gold: any,
  heldOutCase?: any,
): any
export function replayDir(dir: string): any[]
export function tableMarkdown(rows: any[]): string

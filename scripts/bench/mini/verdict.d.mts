/* eslint-disable @typescript-eslint/no-explicit-any -- loose types for the scripts under test */
// Types for scripts/bench/mini/verdict.mjs (tests/scripts/bench-mini.test.ts).
export type Level = 'will_work' | 'risky' | 'wont_work'
export function verdictOf(input: {
  probes: Record<string, any>
  speed: any
  score: number
  thresholds: any
}): { level: Level; reasons: string[] }
export const LEVEL_LABEL: Record<Level, string>
export function summaryMarkdown(run: any): string

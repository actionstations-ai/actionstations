/* eslint-disable @typescript-eslint/no-explicit-any -- loose types for the scripts under test */
// Types for scripts/bench/mini/verdict.mjs (tests/scripts/bench-mini.test.ts).
export type Level = 'recommended' | 'usable' | 'not_recommended'
export const LEVELS: Level[]
export const LEVEL_LABEL: Record<Level, string>
export function bandOf(
  figures: { completion: number; quality: number; damage?: number },
  bands: any,
): Level
export function verdictOf(input: { result: any; repeats?: any[]; bands: any }): {
  level: Level
  reasons: string[]
  notes: string[]
  uncertain?: Level[]
}
export function summaryMarkdown(run: any): string

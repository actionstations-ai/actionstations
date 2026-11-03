// Types for scripts/bench/rescore.mjs (tests/scripts/bench-critique-revision.test.ts).
import type { Suite } from './types.d.mts'
interface Case {
  caseId: string
  score: number
  parts: Record<string, number>
  details: {
    noted: number
    notedIds: string[]
    fixedIds: string[]
    damaged: { id: string; tag?: string; fields: string[] }[]
  }
}
interface RescoredRepeat {
  cases: (Case | null)[]
}
export function rescoreRun(
  run: unknown,
  workRoot: string,
  suite: Suite,
): {
  repeats: RescoredRepeat[]
  summary: {
    median: {
      tasks: Record<string, number>
      overall: number
      critique?: { recall: number; fixed: number; damage: number }
    }
  }
  missing: string[]
  floor: { before: boolean; after: boolean }
}
export function summarize(dir: string): Record<string, unknown>
export function tableMarkdown(rows: Record<string, unknown>[]): string

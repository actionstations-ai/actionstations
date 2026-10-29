// Types for scripts/bench/score/ideation.mjs.
import type { IdeaLike } from '../types.d.mts'
export function termVector(text: string): Map<string, number>
export function cosine(a: Map<string, number>, b: Map<string, number>): number
export function nearDuplicates(ideas: IdeaLike[], threshold: number): Set<number>
export function droppedIdeaKeys(entries: { message?: string }[]): number
export function ideationScore(
  ideas: IdeaLike[],
  opts: {
    count: number
    dropped: number
    threshold: number
    grounding?: Record<string, { label: string } | undefined>
  },
): {
  valid: number
  distinct: number
  resolution: number
  spread: number
  grounding?: number
  ideas: number
  nearDuplicates: number
  citationsKept: number
  citationsDropped: number
}

import type { VoteView } from '@shared/schemas/live'

export function percentOf(count: number, voted: number): number {
  return voted > 0 ? Math.round((count / voted) * 100) : 0
}

/** Ids of the options with the most votes (none while nobody has voted). */
export function leaders(view: Pick<VoteView, 'options'>): Set<string> {
  const top = Math.max(0, ...view.options.map((o) => o.count))
  return new Set(top > 0 ? view.options.filter((o) => o.count === top).map((o) => o.id) : [])
}

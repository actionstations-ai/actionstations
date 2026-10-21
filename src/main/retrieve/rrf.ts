// Reciprocal rank fusion (Cormack et al. 2009): score(d) = Σ 1 / (k + rank_i(d)), ranks 1-based.
// Rank-based, so BM25 scores and cosine distances never need to be put on one scale.

export const RRF_K = 60

export interface FusedRank {
  id: number
  score: number
  ftsRank?: number
  vecRank?: number
}

/** Fuse two ranked id lists (best first). Ties keep FTS order, then vector order. */
export function reciprocalRankFusion(
  ftsIds: readonly number[],
  vecIds: readonly number[],
  k = RRF_K,
): FusedRank[] {
  const byId = new Map<number, FusedRank & { order: number }>()
  const add = (ids: readonly number[], field: 'ftsRank' | 'vecRank'): void => {
    ids.forEach((id, i) => {
      const rank = i + 1
      const entry = byId.get(id) ?? { id, score: 0, order: byId.size }
      if (entry[field] !== undefined) return
      entry[field] = rank
      entry.score += 1 / (k + rank)
      byId.set(id, entry)
    })
  }
  add(ftsIds, 'ftsRank')
  add(vecIds, 'vecRank')
  return [...byId.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ order: _order, ...rest }) => rest)
}

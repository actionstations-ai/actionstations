import { describe, expect, it } from 'vitest'
import { RRF_K, reciprocalRankFusion } from './rrf'

describe('reciprocalRankFusion', () => {
  it('scores each list as 1/(k + rank) with 1-based ranks and k=60', () => {
    expect(RRF_K).toBe(60)
    const [only] = reciprocalRankFusion([7], [])
    expect(only).toEqual({ id: 7, score: 1 / 61, ftsRank: 1 })
  })

  it('sums contributions for ids in both lists and records both ranks', () => {
    const fused = reciprocalRankFusion([1, 2, 3], [3, 1])
    const byId = Object.fromEntries(fused.map((f) => [f.id, f]))
    expect(byId[1]!.score).toBeCloseTo(1 / 61 + 1 / 62, 12)
    expect(byId[3]!.score).toBeCloseTo(1 / 63 + 1 / 61, 12)
    expect(byId[2]!.score).toBeCloseTo(1 / 62, 12)
    expect(byId[3]).toMatchObject({ ftsRank: 3, vecRank: 1 })
    expect(fused.map((f) => f.id)).toEqual([1, 3, 2])
  })

  it('ranks an id found by both retrievers above one found by a single retriever', () => {
    const fused = reciprocalRankFusion([10, 20], [30, 20])
    expect(fused[0]!.id).toBe(20)
  })

  it('breaks exact ties by first appearance (FTS before vector)', () => {
    const fused = reciprocalRankFusion([1], [2])
    expect(fused.map((f) => f.id)).toEqual([1, 2])
  })

  it('ignores duplicate ids within one list (first rank wins)', () => {
    const [f] = reciprocalRankFusion([5, 5, 5], [])
    expect(f).toEqual({ id: 5, score: 1 / 61, ftsRank: 1 })
  })

  it('returns an empty list when both inputs are empty', () => {
    expect(reciprocalRankFusion([], [])).toEqual([])
  })
})

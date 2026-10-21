import { describe, expect, it } from 'vitest'
import { HashEmbedder } from './hash'

const cos = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i]!, 0)

describe('HashEmbedder', () => {
  const e = new HashEmbedder()
  it('is deterministic and unit-length', async () => {
    const [a, b] = await e.embed(['FIDS failure procedures', 'FIDS failure procedures'])
    expect(a).toHaveLength(384)
    expect(cos(a!, b!)).toBeCloseTo(1, 5)
  })
  it('scores related text above unrelated text', () => {
    const q = e.embedOne('FIDS screens failure whiteboards')
    const related = e.embedOne(
      'FIDS Failure: Ops uses whiteboards and PA announcements when FIDS screens go dark',
    )
    const unrelated = e.embedOne('Severe winter storm snow removal and de-icing priorities')
    expect(cos(q, related)).toBeGreaterThan(cos(q, unrelated))
  })
})

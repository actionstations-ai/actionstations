// Drills from a scenario (spec 0437 FR-7): which annexes a scenario's tested sections lead to.
import { describe, expect, it } from 'vitest'
import { MICRO_DRILL_LIMITS, type Chunk } from '@shared/schemas'
import type { ChunkSource } from './annex'
import { annexesFromCitations, annexFor, MAX_SCENARIO_DRILLS, situationOf } from './from-scenario'

const chunk = (id: number, headingPath: string, tokenCount = 50): Chunk => ({
  id,
  documentId: 'doc',
  headingPath,
  ord: id,
  text: `Text ${id}`,
  tokenCount,
  page: id,
})
const source = (chunks: Chunk[]): ChunkSource => ({ chunks: () => chunks })

const cite = (headingPath: string) => ({ documentId: 'doc', headingPath })

const CHUNKS = [
  chunk(1, 'EOP › 6 Public Information › 6.4 Releases'),
  chunk(2, 'EOP › 6 Public Information › 6.5 Rumors'),
  chunk(3, 'EOP › 7 Recovery'),
  chunk(4, 'EOP › 8 Huge', MICRO_DRILL_LIMITS.annexTokens + 1),
]

describe('annexFor', () => {
  it('takes the shallowest enclosing section that fits a drill', () => {
    const options = [
      { headingPath: 'EOP › 6 Public Information', tokens: 100, tooLarge: false },
      { headingPath: 'EOP › 6 Public Information › 6.4 Releases', tokens: 50, tooLarge: false },
    ]
    expect(annexFor(options, 'EOP › 6 Public Information › 6.4 Releases')).toBe(
      'EOP › 6 Public Information',
    )
  })

  it('steps down to a narrower section when the wider one is too large', () => {
    const options = [
      { headingPath: 'EOP › 8 Huge', tokens: 99999, tooLarge: true },
      { headingPath: 'EOP › 8 Huge › 8.1 Part', tokens: 50, tooLarge: false },
    ]
    expect(annexFor(options, 'EOP › 8 Huge › 8.1 Part')).toBe('EOP › 8 Huge › 8.1 Part')
  })

  it('finds nothing for a section that is not indexed', () => {
    expect(annexFor([], 'EOP › 9 Gone')).toBeUndefined()
  })
})

describe('annexesFromCitations', () => {
  it('gives one annex per distinct section, in order, and reports sections it cannot use', () => {
    const { annexes, skipped } = annexesFromCitations(source(CHUNKS), [
      cite('EOP › 6 Public Information › 6.4 Releases'),
      cite('EOP › 6 Public Information › 6.5 Rumors'),
      cite('EOP › 7 Recovery'),
      cite('EOP › 8 Huge'),
    ])
    expect(annexes).toEqual([
      { documentId: 'doc', headingPath: 'EOP › 6 Public Information' },
      { documentId: 'doc', headingPath: 'EOP › 7 Recovery' },
    ])
    expect(skipped).toEqual(['EOP › 8 Huge'])
  })

  it(`stops at ${MAX_SCENARIO_DRILLS} drills`, () => {
    const many = Array.from({ length: 8 }, (_, i) => chunk(i + 1, `EOP › ${i + 1} Section`))
    const { annexes } = annexesFromCitations(
      source(many),
      many.map((c) => cite(c.headingPath)),
    )
    expect(annexes).toHaveLength(MAX_SCENARIO_DRILLS)
  })
})

describe('situationOf', () => {
  it('joins the theme and the threat and keeps it short', () => {
    expect(situationOf(' Baggage outage. ', 'Ransomware. ')).toBe('Baggage outage. Ransomware.')
    expect(situationOf('x'.repeat(900), 'y')).toHaveLength(600)
  })
})

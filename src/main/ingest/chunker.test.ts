import { describe, expect, it } from 'vitest'
import { chunkSections, estimateTokens, splitSentences } from './chunker'
import type { ParsedSection } from './types'

const sentence = (i: number) =>
  `Sentence number ${i} tells the duty manager to call the airport operations center now.`
const paragraph = (from: number, count: number) =>
  Array.from({ length: count }, (_, k) => sentence(from + k)).join(' ')

describe('estimateTokens', () => {
  it('counts words × 1.3, rounded up', () => {
    expect(estimateTokens('one two three')).toBe(4)
    expect(estimateTokens('  ')).toBe(0)
  })
})

describe('splitSentences', () => {
  it('splits on sentence ends followed by a capital or digit', () => {
    expect(splitSentences('Call AOC. Then ARFF! 3 units respond? yes.')).toEqual([
      'Call AOC.',
      'Then ARFF!',
      '3 units respond? yes.',
    ])
  })
})

describe('chunkSections', () => {
  it('keeps a small section as one chunk with its heading path and page, text unprefixed', () => {
    const chunks = chunkSections(
      [
        {
          headingPath: ['SECTION 13: CYBER', '13.6 Scenario C: FIDS'],
          page: 4,
          text: 'Post paper boards.',
        },
      ],
      'TIRP',
    )
    expect(chunks).toEqual([
      {
        headingPath: 'TIRP › Section 13 › 13.6 Scenario C: FIDS',
        page: 4,
        ord: 0,
        text: 'Post paper boards.',
        tokenCount: 4,
      },
    ])
  })

  it('splits long sections near the target with ~80 tokens of overlap', () => {
    const text = [paragraph(0, 30), paragraph(30, 30), paragraph(60, 30)].join('\n\n')
    const chunks = chunkSections([{ headingPath: ['SECTION 1: X'], text }], 'D')
    expect(chunks.length).toBeGreaterThan(2)
    for (const c of chunks) expect(c.tokenCount).toBeLessThanOrEqual(600)
    for (const c of chunks.slice(0, -1)) expect(c.tokenCount).toBeGreaterThan(400)
    for (let i = 1; i < chunks.length; i++) {
      const prevTail = chunks[i - 1]!.text.split(/(?<=\.)\s+/).at(-1)!
      expect(chunks[i]!.text).toContain(prevTail)
      const overlap = chunks[i]!.text.indexOf(prevTail) + prevTail.length
      expect(estimateTokens(chunks[i]!.text.slice(0, overlap))).toBeLessThanOrEqual(80)
    }
    expect(chunks.map((c) => c.ord)).toEqual(chunks.map((_, i) => i))
  })

  it('never merges two sections, even tiny ones under the same top-level heading', () => {
    const sections: ParsedSection[] = [
      { headingPath: ['SECTION 1: A', '1.1 One'], text: 'Alpha.' },
      { headingPath: ['SECTION 1: A', '1.2 Two'], text: 'Bravo.' },
      { headingPath: ['SECTION 2: B'], text: 'Charlie.' },
    ]
    expect(chunkSections(sections, 'D').map((c) => [c.headingPath, c.text])).toEqual([
      ['D › Section 1 › 1.1 One', 'Alpha.'],
      ['D › Section 1 › 1.2 Two', 'Bravo.'],
      ['D › Section 2', 'Charlie.'],
    ])
  })

  it('packs a section continued across pages and keeps the page where each chunk starts', () => {
    const sections: ParsedSection[] = [
      { headingPath: ['SECTION 3: C'], page: 7, text: paragraph(0, 40) },
      { headingPath: ['SECTION 3: C'], page: 8, text: paragraph(40, 40) },
    ]
    const chunks = chunkSections(sections, 'D')
    expect(chunks[0]!.page).toBe(7)
    expect(chunks.at(-1)!.page).toBe(8)
    expect(new Set(chunks.map((c) => c.headingPath))).toEqual(new Set(['D › Section 3']))
  })

  it('keeps a table intact when it fits and repeats the header when it must split', () => {
    const table = (rows: number) =>
      [
        '| Role | Phone |',
        '| --- | --- |',
        ...Array.from(
          { length: rows },
          (_, i) => `| Officer ${i} on duty tonight | 330-555-${1000 + i} |`,
        ),
      ].join('\n')
    const small = chunkSections([{ headingPath: ['ANNEX A'], text: `Intro.\n\n${table(5)}` }], 'D')
    expect(small).toHaveLength(1)
    expect(small[0]!.text).toContain(table(5))

    const big = chunkSections([{ headingPath: ['ANNEX A'], text: table(120) }], 'D')
    expect(big.length).toBeGreaterThan(1)
    for (const c of big) {
      expect(c.text.startsWith('| Role | Phone |\n| --- | --- |')).toBe(true)
      expect(c.tokenCount).toBeLessThanOrEqual(600)
    }
  })

  it('splits a giant run-on sentence by words', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(' ')
    const chunks = chunkSections([{ headingPath: [], text: words }], 'D')
    expect(chunks.length).toBeGreaterThan(3)
    for (const c of chunks) expect(c.tokenCount).toBeLessThanOrEqual(600)
    expect(chunks[0]!.headingPath).toBe('D')
  })

  it('honors custom target and overlap', () => {
    const chunks = chunkSections([{ headingPath: [], text: paragraph(0, 20) }], 'D', {
      targetTokens: 100,
      overlapTokens: 0,
    })
    const joined = chunks.map((c) => c.text).join(' ')
    expect(joined).toBe(paragraph(0, 20))
  })
})

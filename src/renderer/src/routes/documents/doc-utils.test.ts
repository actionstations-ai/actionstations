import { describe, expect, it } from 'vitest'
import {
  buildHeadingTree,
  formatDate,
  normalizeTag,
  paginateText,
  splitHeadingPath,
} from './doc-utils'
import { applyProgress, clearJob, seedJob } from './job-progress'

describe('splitHeadingPath', () => {
  it('splits on the › separator used by ingest and tolerates >', () => {
    expect(splitHeadingPath('TIRP › Section 13 › 13.6 FIDS/BHS')).toEqual([
      'TIRP',
      'Section 13',
      '13.6 FIDS/BHS',
    ])
    expect(splitHeadingPath('A > B')).toEqual(['A', 'B'])
    expect(splitHeadingPath('  ')).toEqual([])
  })
})

describe('buildHeadingTree', () => {
  it('nests paths and merges shared prefixes in first-seen order', () => {
    const tree = buildHeadingTree([
      'TIRP › Section 13 › 13.6 FIDS',
      'TIRP › Section 13 › 13.7 BHS',
      'TIRP › Section 14',
      'AEP',
    ])
    expect(tree.map((n) => n.label)).toEqual(['TIRP', 'AEP'])
    const tirp = tree[0]!
    expect(tirp.children.map((n) => n.label)).toEqual(['Section 13', 'Section 14'])
    expect(tirp.children[0]!.children.map((n) => n.key)).toEqual([
      'TIRP › Section 13 › 13.6 FIDS',
      'TIRP › Section 13 › 13.7 BHS',
    ])
  })
  it('returns an empty forest for no paths', () => {
    expect(buildHeadingTree([])).toEqual([])
  })
})

describe('paginateText', () => {
  it('keeps short text on one page', () => {
    expect(paginateText('hello', 10)).toEqual(['hello'])
  })
  it('breaks long text at line ends and loses nothing', () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n')
    const pages = paginateText(text, 40)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.join('')).toBe(text)
    for (const p of pages.slice(0, -1)) expect(p.endsWith('\n')).toBe(true)
  })
  it('hard-splits a single line longer than a page', () => {
    const pages = paginateText('x'.repeat(25), 10)
    expect(pages).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)])
  })
})

describe('normalizeTag', () => {
  it('trims, collapses spaces and rejects case-insensitive duplicates', () => {
    expect(normalizeTag('  baggage   hall ', [])).toBe('baggage hall')
    expect(normalizeTag('Terminal', ['terminal'])).toBeNull()
    expect(normalizeTag('   ', [])).toBeNull()
  })
})

describe('formatDate', () => {
  it('shows a dash for missing or invalid dates', () => {
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('not a date')).toBe('—')
    expect(formatDate('2026-10-01T12:00:00.000Z')).toMatch(/2026/)
  })
})

describe('job progress state', () => {
  const ev = (over: object) => ({
    jobId: 'J1',
    kind: 'ingest' as const,
    status: 'running' as const,
    progress: 0.5,
    message: 'Parsing',
    ...over,
  })
  it('moves only the named item when itemId is one of the targets', () => {
    const live = applyProgress({}, ['a', 'b'], ev({ itemId: 'b' }))
    expect(Object.keys(live)).toEqual(['b'])
    expect(live.b).toMatchObject({ jobId: 'J1', progress: 0.5, message: 'Parsing' })
  })
  it('applies job-level progress to every target otherwise', () => {
    const live = applyProgress({}, ['a', 'b'], ev({ itemId: 'zzz', stage: 'embed' }))
    expect(Object.keys(live).sort()).toEqual(['a', 'b'])
    expect(live.a!.stage).toBe('embed')
  })
  it('seeds and clears by job id without touching other jobs', () => {
    let live = seedJob({}, 'J1', ['a'], 'Queued')
    live = seedJob(live, 'J2', ['b'], 'Queued')
    live = clearJob(live, 'J1')
    expect(Object.keys(live)).toEqual(['b'])
  })
})

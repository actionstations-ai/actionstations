import { describe, expect, it } from 'vitest'
import { highlightSegments, queryTerms, snippet, stripMarkdown } from './highlight'

describe('queryTerms', () => {
  it('lowercases, dedupes, drops short words and FTS operators, longest first', () => {
    expect(queryTerms('BHS failure AND bhs a manual')).toEqual(['failure', 'manual', 'bhs'])
  })
  it('treats regex metacharacters as separators', () => {
    expect(queryTerms('(FIDS|BHS)*')).toEqual(['fids', 'bhs'])
  })
})

describe('highlightSegments', () => {
  it('marks case-insensitive matches and keeps the original casing', () => {
    expect(highlightSegments('The BHS failed; bhs down', ['bhs'])).toEqual([
      { text: 'The ', match: false },
      { text: 'BHS', match: true },
      { text: ' failed; ', match: false },
      { text: 'bhs', match: true },
      { text: ' down', match: false },
    ])
  })
  it('passes markup through as plain text segments', () => {
    const segs = highlightSegments('<img src=x onerror=alert(1)> fids', ['fids'])
    expect(segs[0]).toEqual({ text: '<img src=x onerror=alert(1)> ', match: false })
    expect(segs[1]).toEqual({ text: 'fids', match: true })
  })
  it('returns the whole text unmarked when there are no terms', () => {
    expect(highlightSegments('abc', [])).toEqual([{ text: 'abc', match: false }])
    expect(highlightSegments('', ['x'])).toEqual([])
  })
})

describe('snippet', () => {
  const long = `${'intro '.repeat(100)}the baggage handling system failed ${'tail '.repeat(100)}`
  it('returns short text unchanged (whitespace collapsed)', () => {
    expect(snippet('a\n\n b', ['a'])).toBe('a b')
  })
  it('centres on the first match with ellipses on both sides', () => {
    const s = snippet(long, ['baggage'], 120)
    expect(s.startsWith('… ')).toBe(true)
    expect(s.endsWith(' …')).toBe(true)
    expect(s).toContain('baggage handling')
    expect(s.length).toBeLessThanOrEqual(126)
  })
  it('starts at the beginning when nothing matches', () => {
    expect(snippet(long, ['nomatch'], 60).startsWith('intro')).toBe(true)
  })
})

describe('stripMarkdown', () => {
  it('drops emphasis, code and link markup but keeps the words', () => {
    expect(stripMarkdown('**Impact:** the _FIDS_ and `BHS` fail, see [TIRP](x.md).')).toBe(
      'Impact: the FIDS and BHS fail, see TIRP.',
    )
    expect(stripMarkdown('__Note__ *now* ~~old~~')).toBe('Note now old')
  })
  it('keeps snake_case identifiers and arithmetic asterisks intact', () => {
    expect(stripMarkdown('AODB_SQL_MASTER at 2 * 3 gates')).toBe('AODB_SQL_MASTER at 2 * 3 gates')
  })
  it('turns pipe tables into dot-separated cells and removes rule rows', () => {
    const table = '| System | Owner |\n|---|:---:|\n| FIDS | IT |'
    expect(stripMarkdown(table)).toBe('System · Owner\n\nFIDS · IT')
  })
  it('removes heading, quote and list markers', () => {
    expect(stripMarkdown('## 13.6 FIDS\n> quoted\n- item\n* other')).toBe(
      '13.6 FIDS\nquoted\n• item\n• other',
    )
  })
})

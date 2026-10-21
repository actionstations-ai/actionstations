import { describe, expect, it } from 'vitest'
import { toFtsQuery } from './fts-query'

describe('toFtsQuery', () => {
  it('quotes each content term and ORs them, dropping stopwords', () => {
    expect(toFtsQuery('What is the FIDS failure procedure?')).toBe(
      '"fids" OR "failure" OR "procedure"',
    )
  })

  it('keeps section numbers with dots as one quoted term', () => {
    expect(toFtsQuery('TIRP 13.6')).toBe('"tirp" OR "13.6"')
  })

  it('strips the § sign and keeps the number', () => {
    expect(toFtsQuery('§13.6 and § 1542.307')).toBe('"13.6" OR "1542.307"')
  })

  it('keeps hyphenated words together (FTS5 treats the quoted term as a phrase)', () => {
    expect(toFtsQuery('fail-unlocked doors')).toBe('"fail-unlocked" OR "doors"')
  })

  it('neutralizes FTS5 syntax characters and operators', () => {
    const q = toFtsQuery('fids* AND (bhs OR "x) NEAR(a b) col:val ^start -minus +plus')
    expect(q).toBeDefined()
    // Every token is wrapped in quotes; no bare operator or syntax char survives.
    for (const part of q!.split(' OR ')) expect(part).toMatch(/^"[^"]+"$/)
    expect(q).not.toMatch(/[*():^+]/)
  })

  it('keeps user-quoted phrases as phrases', () => {
    expect(toFtsQuery('"fail unlocked" access control')).toBe(
      '"fail unlocked" OR "access" OR "control"',
    )
  })

  it('deduplicates terms case-insensitively', () => {
    expect(toFtsQuery('FIDS fids Fids')).toBe('"fids"')
  })

  it('falls back to stopwords when the query is only stopwords', () => {
    expect(toFtsQuery('the and')).toBe('"the" OR "and"')
  })

  it('returns undefined for queries with no searchable term', () => {
    expect(toFtsQuery('  ?!* () "" ')).toBeUndefined()
    expect(toFtsQuery('')).toBeUndefined()
  })

  it('handles unbalanced quotes', () => {
    expect(toFtsQuery('"ransomware note')).toBe('"ransomware" OR "note"')
  })
})

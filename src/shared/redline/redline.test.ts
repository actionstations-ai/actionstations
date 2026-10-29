// Excerpt matching and the word diff (#431): the pure parts the redline export rests on.
import { describe, expect, it } from 'vitest'
import { acceptedText, originalText, wordDiff } from './diff'
import { countExcerpt, findExcerpt } from './excerpt'

describe('findExcerpt', () => {
  const text = 'Intro.\n\nThe PIO may release\ninformation after “consulting” the IC.\n\nEnd.'

  it('finds an excerpt across non-breaking spaces, line breaks and curly quotes', () => {
    const span = findExcerpt(text, 'The PIO may release information after "consulting" the IC.')
    expect(span).not.toBeNull()
    expect(text.slice(span!.start, span!.end)).toBe(
      'The PIO may release\ninformation after “consulting” the IC.',
    )
  })

  it('refuses text that is not there, even when the words are close', () => {
    expect(
      findExcerpt(text, 'The PIO must release information after consulting the IC.'),
    ).toBeNull()
    expect(findExcerpt(text, '')).toBeNull()
  })

  it('anchors a repeated sentence to its first occurrence and counts them', () => {
    const twice = 'Close the log. Other text. Close the log.'
    expect(findExcerpt(twice, 'Close the log.')).toEqual({ start: 0, end: 14 })
    expect(countExcerpt(twice, 'Close the log.')).toBe(2)
  })
})

describe('wordDiff', () => {
  it('marks only the changed words and keeps the rest equal', () => {
    const ops = wordDiff('The PIO may release it.', 'The PIO releases it.')
    expect(
      ops
        .filter((o) => o.kind === 'del')
        .map((o) => o.text.trim())
        .join(' '),
    ).toBe('may release')
    expect(
      ops
        .filter((o) => o.kind === 'ins')
        .map((o) => o.text.trim())
        .join(' '),
    ).toBe('releases')
  })

  it('reads back as either side once changes are accepted or rejected', () => {
    const a = 'Notify the county within 30 minutes.'
    const b = 'Notify the county and the state within 15 minutes.'
    const ops = wordDiff(a, b)
    expect(acceptedText(ops)).toBe(b)
    expect(originalText(ops)).toBe(a)
  })

  it('is deterministic', () => {
    expect(wordDiff('a b c', 'a c d')).toEqual(wordDiff('a b c', 'a c d'))
  })
})

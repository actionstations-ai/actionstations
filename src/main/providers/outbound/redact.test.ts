// Keyed placeholders (FR-11) and their reversal (FR-13).
import { describe, expect, it } from 'vitest'
import { REDACTION_CATEGORIES, type RedactionCategory } from '@shared/schemas'
import { emptyContext } from './detect'
import { RedactionRegistry, redactText } from './redact'
import { reverseDeep, reverseText } from './reverse'

const ALL = new Set<RedactionCategory>(REDACTION_CATEGORIES)
const KEY = Buffer.alloc(32, 7)
const registry = (key = KEY) => new RedactionRegistry(key)
const redact = (text: string, r = registry(), ctx = emptyContext()) => redactText(text, ALL, ctx, r)

const SAMPLE =
  'Chief Dana Ruiz (509) 555-0142, dana.ruiz@rivergate.org, 1200 Riverside Drive. Ruiz agreed.'

describe('redactText', () => {
  it('replaces every value with a bracketed placeholder and keeps the rest', () => {
    const { text, spans } = redact(SAMPLE)
    expect(text).toMatch(
      /^Chief \[\[PERSON_[A-Z2-7]{4}\]\] \[\[PHONE_[A-Z2-7]{4}\]\], \[\[EMAIL_[A-Z2-7]{4}\]\], \[\[ADDRESS_[A-Z2-7]{4}\]\]\. \[\[PERSON_[A-Z2-7]{4}\]\] agreed\.$/,
    )
    for (const v of ['Dana', 'Ruiz', '555', 'rivergate', 'Riverside']) expect(text).not.toContain(v)
    for (const s of spans) expect(text.slice(s.start, s.end)).toBe(s.placeholder)
  })

  it('is deterministic for the same key, across registries and calls', () => {
    expect(redact(SAMPLE).text).toBe(redact(SAMPLE).text)
    const r = registry()
    expect(redact(SAMPLE, r).text).toBe(redact(SAMPLE, r).text)
  })

  it('gives the same value the same placeholder in every request, whatever its spelling', () => {
    const r = registry()
    const a = redact('Call (509) 555-0142', r).spans[0]!.placeholder
    const b = redact('or 509.555.0142 today', r).spans[0]!.placeholder
    expect(a).toBe(b)
    const c = redact('Michael Okafor arrived', r).spans[0]!.placeholder
    const d = redact('Then MICHAEL OKAFOR left', registry()).spans
    expect(d).toEqual([]) // all-caps is not a detected name; shown so the limit is documented
    expect(redact('Michael Okafor left', r).spans[0]!.placeholder).toBe(c)
  })

  it('spells placeholders differently under another project key', () => {
    expect(redact(SAMPLE, registry(Buffer.alloc(32, 9))).text).not.toBe(redact(SAMPLE).text)
  })

  it('extends the code by one character when two values collide', () => {
    const r = registry()
    const tokens = new Set<string>()
    // 20-bit codes: issue enough values that some share their first four characters.
    for (let i = 0; i < 3000; i++) tokens.add(r.issue('person', `Person ${i}`))
    expect(tokens.size).toBe(3000)
    const long = [...tokens].filter((t) => t.length > 'PERSON_XXXX'.length)
    expect(long.length).toBeGreaterThan(0)
    for (const t of long) expect(tokens.has(t.slice(0, -1))).toBe(true)
  })

  it('applies Always and Never lists', () => {
    const ctx = { ...emptyContext(), alwaysRedact: ['Big Mike'], neverRedact: ['Dana Ruiz'] }
    const { text } = redact('Big Mike met Chief Dana Ruiz.', registry(), ctx)
    expect(text).toMatch(/^\[\[PERSON_[A-Z2-7]{4}\]\] met Chief Dana Ruiz\.$/)
  })

  it('redacts nothing when every category is off and no terms are listed', () => {
    expect(redactText(SAMPLE, new Set(), emptyContext(), registry()).text).toBe(SAMPLE)
  })
})

describe('reverse', () => {
  const r = registry()
  const { text } = redact('Chief Dana Ruiz called (509) 555-0142.', r)
  const [person, phone] = text.match(/\[\[[A-Z]+_[A-Z2-7]+\]\]/g)!
  const bare = (p: string) => p.slice(2, -2)

  it('restores the forms models produce', () => {
    for (const form of [person!, `[${bare(person!)}]`, bare(person!), bare(person!).toLowerCase()])
      expect(reverseText(`Ask ${form} now`, r)).toEqual({ value: 'Ask Dana Ruiz now', unknown: [] })
  })

  it('restores every string in a JSON value, keys included', () => {
    const json = { title: `Call ${phone}`, rows: [{ who: person, [bare(person!)]: 1 }], n: 3 }
    expect(reverseDeep(json, r)).toEqual({
      value: { title: 'Call (509) 555-0142', rows: [{ who: 'Dana Ruiz', 'Dana Ruiz': 1 }], n: 3 },
      unknown: [],
    })
  })

  it('leaves placeholders the project never issued and reports them', () => {
    expect(reverseText('Ask [[PERSON_ZZZZ]] and [[PERSON_ZZZZ]]', r)).toEqual({
      value: 'Ask [[PERSON_ZZZZ]] and [[PERSON_ZZZZ]]',
      unknown: ['PERSON_ZZZZ'],
    })
  })

  it('never replaces part of a longer word or code', () => {
    const word = `${bare(person!)}X`
    expect(reverseText(`id ${word} and x${bare(person!)}`, r).value).toBe(
      `id ${word} and x${bare(person!)}`,
    )
  })
})

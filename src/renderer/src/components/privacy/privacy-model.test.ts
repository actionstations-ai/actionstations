import { describe, expect, it } from 'vitest'
import { PrivacySettings } from '@shared/schemas/privacy'
import {
  addTerm,
  cloudMarkerText,
  effectiveOf,
  groupExcerpts,
  partLabel,
  redactionSummary,
  segmentsOf,
} from './privacy-model'
import { manifest } from './test-fixtures'

describe('privacy model (#433)', () => {
  it('groups excerpts by document in first-seen order with counts', () => {
    const groups = groupExcerpts(manifest().excerpts)
    expect(groups.map((g) => [g.documentTitle, g.excerpts.length])).toEqual([
      ['Emergency Operations Plan', 2],
      ['Water System Plan', 1],
    ])
  })

  it('splits text at redaction spans and skips spans that do not fit', () => {
    const m = manifest()
    const text = m.excerpts[0]!.text
    const segs = segmentsOf(text, [
      ...m.spans,
      { ...m.spans[0]!, start: 10, end: 12 }, // overlaps the first: skipped
      { ...m.spans[0]!, start: 500, end: 510 }, // outside the text: skipped
    ])
    expect(segs.map((s) => ('span' in s ? `<${s.text}>` : s.text)).join('')).toBe(
      'Call <[[PERSON_7F3K]]> at <[[PHONE_Q2MA]]> before opening the EOC.',
    )
  })

  it('summarises redaction (on by default) and resolves project overrides', () => {
    const global = PrivacySettings.parse({})
    expect(redactionSummary(global)).toBe('Names, phone numbers, email addresses, street addresses')
    const eff = effectiveOf(global, { review: 'every-request', redact: { person: false } })
    expect(eff.review).toBe('every-request')
    expect(redactionSummary(eff)).toBe('Phone numbers, email addresses, street addresses')
    expect(
      redactionSummary({ redact: { person: false, phone: false, email: false, address: false } }),
    ).toBe('Off')
  })

  it('adds terms once, case-insensitively, and refuses too-short ones', () => {
    expect(addTerm(['Rivergate'], ' rivergate ')).toEqual(['Rivergate'])
    expect(addTerm([], 'x')).toBeNull()
    expect(addTerm([], ' Chief Dana ')).toEqual(['Chief Dana'])
  })

  it('labels parts', () => {
    expect(partLabel('system')).toBe('Instructions')
    expect(partLabel('message:1:assistant')).toBe('Message 2 (assistant)')
    expect(partLabel('text:0')).toBe('text:0')
  })

  it('marks cloud providers and LAN providers the user treats as local', () => {
    expect(cloudMarkerText({ kind: 'anthropic', options: {} })).toBe(
      'Cloud: sends excerpts to api.anthropic.com',
    )
    expect(
      cloudMarkerText({ kind: 'ollama', baseUrl: 'http://127.0.0.1:11434', options: {} }),
    ).toBeNull()
    const lan = { kind: 'openai-compatible' as const, baseUrl: 'http://192.168.1.20:1234/v1' }
    expect(cloudMarkerText({ ...lan, options: {} })).toBe('Cloud: sends excerpts to 192.168.1.20')
    expect(
      cloudMarkerText({ ...lan, options: { network: 'local', localHost: '192.168.1.20' } }),
    ).toBe('On your network, treated as local')
  })
})

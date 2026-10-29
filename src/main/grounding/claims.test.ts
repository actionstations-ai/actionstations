// Claims and anchor terms (#423, FR-3.2) on expected actions from the shipped examples.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Scenario } from '@shared/schemas'
import { anchorTerms, splitClaims } from './claims'

const EXAMPLES = resolve(import.meta.dirname, '../../../examples')
const scenario = (slug: string, id: string): Scenario =>
  JSON.parse(
    readFileSync(resolve(EXAMPLES, slug, 'project/scenarios', id, 'scenario.json'), 'utf8'),
  ) as Scenario
const row = (s: Scenario, id: string) => s.msel.find((r) => r.id === id)!

const water = scenario('city-water', '01M5H5QV0SX30ZXCBK3QMBSP9Q')
const gas = scenario('gas-distribution', '01M5QYY2EXGKMC50QJX3FSRYFB')
const terms = (text: string, ignore: string[] = []) =>
  anchorTerms(text, { ignore }).map((a) => `${a.kind}:${a.text}`)

describe('splitClaims', () => {
  it('splits an expected action into its sentences, not at section numbers', () => {
    expect(splitClaims(row(water, 'I-02').expectedAction)).toEqual([
      'WQ confirms the lab results and immediately notifies the Director and the SCADA / IT Security Manager.',
      'WQ declares a Level 3 condition per EOP 7.5 and triggers the advisory decision clock (Section 5.3).',
      'The Ohio EPA DDAGW Central District liaison logs the exceedance and asks when the department will make its formal notification.',
    ])
  })

  it('drops a DECISION POINT label and empty lines', () => {
    expect(splitClaims('DECISION POINT: the IC decides.\n\n')).toEqual(['the IC decides.'])
    expect(splitClaims('')).toEqual([])
  })
})

describe('anchorTerms', () => {
  it('finds roles, sections and action verbs in a water-utility row', () => {
    const [first, second] = splitClaims(row(water, 'I-02').expectedAction)
    expect(terms(first!)).toEqual([
      'role:Director',
      'role:SCADA / IT Security Manager',
      'verb:notifies',
    ])
    expect(terms(second!, ['WQ'])).toEqual([
      'section:EOP 7.5',
      'section:Section 5.3',
      'verb:declares',
    ])
  })

  it('reads durations and section numbers in a gas-utility decision point', () => {
    const text = splitClaims(row(gas, 'I-12b').expectedAction)[0]!
    const anchors = anchorTerms(text)
    expect(anchors.find((a) => a.kind === 'duration')).toMatchObject({
      text: '20 minutes',
      value: 20,
    })
    expect(anchors.find((a) => a.kind === 'section')).toMatchObject({ key: '6' })
  })

  it('reads number words, units and tag-shaped identifiers', () => {
    const anchors = anchorTerms(
      'Notify CISA within seventy-two hours; hold NAOH-FC-203 at 14 mg/L.',
    )
    expect(anchors.map((a) => `${a.kind}:${a.key}`)).toEqual([
      'duration:4320min',
      'quantity:14 mg/l',
      'identifier:naoh-fc-203',
      'agency:cisa',
      'verb:notify',
    ])
  })

  it('leaves out the scenario’s own role abbreviations and common acronyms', () => {
    expect(terms('IT checks the GPS and SCADA logs.', ['IT'])).toEqual([])
  })
})

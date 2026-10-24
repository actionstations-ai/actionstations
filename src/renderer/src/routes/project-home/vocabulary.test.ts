import { describe, expect, it } from 'vitest'
import { builtinProfile } from '@shared/domains'
import { freightRailProfile } from '@shared/domains/pack-fixtures'
import { customizedCount, resetVocab, setVocabList, vocabLists } from './vocabulary'

const transit = builtinProfile('transit')

describe('customize vocabulary', () => {
  it("starts from a pack domain's snapshot when the project has one (#263)", () => {
    const snapshot = { profile: freightRailProfile(), packId: 'p', version: '1.0.0' }
    expect(vocabLists('freight_rail', {}, snapshot).outsideParties).toEqual(['FRA', 'Shippers'])
    expect(
      setVocabList('freight_rail', {}, 'outsideParties', ['FRA', 'Shippers'], snapshot),
    ).toEqual({})
    expect(vocabLists('freight_rail', {}).outsideParties).toEqual(
      builtinProfile('generic').outsideParties,
    )
  })

  it('starts from the built-in profile lists', () => {
    const lists = vocabLists('bus', {})
    expect(lists.roles).toEqual(transit.roles.map((r) => r.name))
    expect(lists.systemsOt).toEqual(transit.systems.ot)
  })

  it('stores a changed list as an override and drops it when it matches again', () => {
    const changed = setVocabList('transit', {}, 'outsideParties', ['County OEM'])
    expect(changed.outsideParties).toEqual(['County OEM'])
    expect(customizedCount(changed)).toBe(1)
    const back = setVocabList('transit', changed, 'outsideParties', [...transit.outsideParties])
    expect(back).toEqual({})
  })

  it('keeps existing role details and makes templates for new role names', () => {
    const first = transit.roles[0]!
    const next = setVocabList('transit', {}, 'roles', [first.name, 'Rail Safety Officer'])
    expect(next.roles?.[0]).toEqual(first)
    expect(next.roles?.[1]).toEqual({
      key: 'rail_safety_officer',
      name: 'Rail Safety Officer',
      abbreviation: 'RSO',
      team: '',
      description: '',
    })
  })

  it('edits IT and OT systems as one override', () => {
    const it1 = setVocabList('transit', {}, 'systemsIt', ['Fare back office'])
    expect(it1.systems).toEqual({ it: ['Fare back office'], ot: transit.systems.ot })
    const both = setVocabList('transit', it1, 'systemsOt', ['Traction SCADA'])
    expect(both.systems).toEqual({ it: ['Fare back office'], ot: ['Traction SCADA'] })
    expect(vocabLists('transit', both).systemsIt).toEqual(['Fare back office'])
  })

  it('resets only the fields it manages', () => {
    const o = { outsideParties: ['X'], noiseExamples: ['a stuck turnstile'] }
    expect(resetVocab(o)).toEqual({ noiseExamples: ['a stuck turnstile'] })
  })
})

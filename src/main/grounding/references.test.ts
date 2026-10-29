// Dangling references (#423, FR-11).
import { describe, expect, it } from 'vitest'
import { danglingReferences, knownNames, resolves } from './references'

const known = knownNames([
  {
    title: 'Harrow Valley Water Authority — Emergency Response Plan',
    shortName: 'ERP',
    headings: ['ERP › Annex A Contacts', 'ERP › Section 5 Public Information'],
  },
  { title: 'Crisis Communications Annex (Annex C)', headings: ['CCA › C.1 Approval'] },
])

describe('dangling references', () => {
  it('lists an annex and a named plan that no document has', () => {
    const text =
      'Translated notices are in Annex F. See Annex F for the Spanish text. ' +
      'Evacuations follow the Regional Evacuation Plan.\nPer the Debris Management Plan, crews clear roads.'
    expect(danglingReferences(text, known)).toEqual([
      { target: 'Annex F', span: 'See Annex F for the Spanish text.' },
      {
        target: 'Debris Management Plan',
        span: 'Per the Debris Management Plan, crews clear roads.',
      },
    ])
  })

  it('resolves references to ingested titles, short names and headings', () => {
    expect(resolves('Annex A', known)).toBe(true)
    expect(resolves('Annex C', known)).toBe(true)
    expect(resolves('Emergency Response Plan', known)).toBe(true)
    expect(resolves('Section 5', known)).toBe(true)
    expect(resolves('Annex B', known)).toBe(false)
  })

  it('lists each missing target once per passage', () => {
    expect(danglingReferences('See Annex F. Also see Annex F.', known)).toHaveLength(1)
  })
})

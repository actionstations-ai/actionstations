import { describe, expect, it } from 'vitest'
import type { FacilityFactCategory } from '@shared/ipc/project'
import {
  addEntries,
  categoryIdFor,
  entryErrors,
  linesOf,
  missingExtracted,
  originOf,
  toSaveCategories,
  type DraftCategory,
} from './facts-draft'

const draft = (entries: string[]): DraftCategory => ({
  id: 'gates',
  label: 'Gates',
  entries: entries.map((value, key) => ({ key: key + 1000, value })),
})
const gates: FacilityFactCategory = {
  id: 'gates',
  label: 'Gates',
  entries: [],
  extracted: ['A1–A8', '24'],
  sources: {},
  linted: true,
}

describe('facts draft', () => {
  it('reads a pasted list one entry per line, dropping bullets and blanks', () => {
    expect(linesOf('- A1\n\n  B2  \r\n* C3\n')).toEqual(['A1', 'B2', 'C3'])
  })

  it('adds only entries the category does not have (case-insensitive)', () => {
    const r = addEntries([draft(['A1'])], 'gates', ['a1', 'B2', 'B2'])
    expect(r.added).toEqual(['B2'])
    expect(r.skipped).toBe(2)
    expect(r.draft[0]!.entries.map((e) => e.value)).toEqual(['A1', 'B2'])
  })

  it('tells extracted entries from added ones and lists extracted ones that were removed', () => {
    expect(originOf(gates, '24')).toBe('extracted')
    expect(originOf(gates, 'Z99')).toBe('added')
    expect(missingExtracted(gates, draft(['24', 'Z99']))).toEqual(['A1–A8'])
  })

  it('makes unique slug ids for new categories', () => {
    expect(categoryIdFor('Pump stations', [])).toBe('pump-stations')
    expect(categoryIdFor('Pump stations', ['pump-stations'])).toBe('pump-stations-2')
    expect(categoryIdFor('!!!', [])).toBe('facts')
  })

  it('flags duplicates and over-long entries, and saves trimmed non-blank entries', () => {
    const d = draft(['A1', 'a1 ', 'x'.repeat(201), '  '])
    expect([...entryErrors([d]).values()]).toEqual([
      'Already listed; it is saved once.',
      'Keep entries under 200 characters.',
    ])
    expect(toSaveCategories([d])[0]!.entries).toEqual(['A1', 'a1', 'x'.repeat(201)])
  })
})

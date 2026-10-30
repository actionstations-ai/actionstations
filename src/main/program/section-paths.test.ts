import { describe, expect, it } from 'vitest'
import { snapshotSections } from './section-paths'

const names = { shortName: 'EOP', title: 'Emergency Operations Plan' }

describe('snapshotSections (#504, #438)', () => {
  it('lists every heading to depth 3, ancestors first, without the short name', () => {
    const paths = [
      'EOP › Section 6 › 6.4 Public Information › Media',
      'EOP › Section 6 › 6.5 Shelters',
      'EOP › Section 9',
    ]
    expect(snapshotSections(paths, names)).toEqual([
      'Section 6',
      'Section 6 › 6.4 Public Information',
      'Section 6 › 6.4 Public Information › Media',
      'Section 6 › 6.5 Shelters',
      'Section 9',
    ])
  })

  it('cuts deeper headings at the depth given', () => {
    expect(snapshotSections(['EOP › A › B › C › D'], names, 2)).toEqual(['A', 'A › B'])
  })

  it('reaches headings far into a long document, up to the cap', () => {
    const paths = Array.from({ length: 500 }, (_, i) => `EOP › Section ${i} › Part`)
    const out = snapshotSections(paths, names, 3, 100)
    expect(out).toHaveLength(100)
    expect(out.at(-1)).toBe('Section 49 › Part')
  })

  it('keeps paths that do not start with the short name as they are', () => {
    expect(snapshotSections(['Intro › Scope'], names)).toEqual(['Intro', 'Intro › Scope'])
  })
})

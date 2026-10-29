import { describe, expect, it } from 'vitest'
import { Framework, type Control } from '@shared/schemas/compliance'
import csfRaw from '../../../packs/frameworks/nist_csf_2.json'
import nis2Raw from '../../../packs/frameworks/nis2_art21.json'
import doraRaw from '../../../packs/frameworks/dora.json'

/** Depth of a control in its hierarchy (0 = top level), following parent links. */
function depth(c: Control, byId: Map<string, Control>): number {
  let d = 0
  for (let p = c.parent; p !== undefined; p = byId.get(p)?.parent) d++
  return d
}

function countByDepth(f: Framework): number[] {
  const byId = new Map(f.controls.map((c) => [c.id, c]))
  const counts: number[] = []
  for (const c of f.controls) {
    const d = depth(c, byId)
    counts[d] = (counts[d] ?? 0) + 1
  }
  return counts
}

describe('bundled framework catalogs', () => {
  it('NIST CSF 2.0 has 6 functions, 22 categories and 106 subcategories', () => {
    const csf = Framework.parse(csfRaw)
    expect(countByDepth(csf)).toEqual([6, 22, 106])
    expect(csf.controls.find((c) => c.id === 'RS.CO-02')?.parent).toBe('RS.CO')
  })

  it('NIS2 lists the ten Article 21(2) measures and the Article 23 reports', () => {
    const nis2 = Framework.parse(nis2Raw)
    const measures = nis2.controls.filter((c) => c.parent === '21').map((c) => c.id)
    expect(measures).toEqual('abcdefghij'.split('').map((l) => `21.2.${l}`))
    expect(nis2.controls.filter((c) => c.parent === '23')).toHaveLength(3)
  })

  it('DORA lists its five chapters with articles 5 to 45 under them', () => {
    const dora = Framework.parse(doraRaw)
    const chapters = dora.controls.filter((c) => c.parent === undefined).map((c) => c.id)
    expect(chapters).toEqual(['II', 'III', 'IV', 'V', 'VI'])
    expect(dora.controls.filter((c) => c.parent !== undefined)).toHaveLength(41)
  })

  it('every mapping rule names controls of its own framework', () => {
    // Framework.parse refuses a dangling rule; this documents that all three pass.
    for (const raw of [csfRaw, nis2Raw, doraRaw])
      expect(Framework.safeParse(raw).success).toBe(true)
  })
})

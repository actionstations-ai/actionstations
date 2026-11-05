// The threat family registry (#655, FR-15): built-ins unchanged, families added by any pack
// content type through one function, validation, and profiles that carry their own families.
import { afterEach, describe, expect, it } from 'vitest'
import {
  AddedThreatFamilies,
  THREAT_FAMILIES,
  THREAT_FAMILY_IDS,
  allThreatFamilies,
  chooseThreatFamily,
  findThreatFamily,
  inferThreatFamily,
  isThreatFamilyId,
  profileThreatFamilies,
  registerPackProfiles,
  resolveThreat,
  setThreatFamilySource,
  threatFamily,
  threatFamilyLabel,
  type ThreatFamily,
} from './index'
import { freightRailEntry, freightRailProfile } from './pack-fixtures'

const cyber = threatFamily('cyber')

/** A minimal valid family a pack could add. */
function flood(over: Partial<ThreatFamily> = {}): ThreatFamily {
  return {
    ...cyber,
    id: 'river_flood',
    label: 'River flood',
    description: 'A river rises past its banks and the plant, the road and the shelter all flood.',
    keywords: ['river flood', 'inundation', 'levee'],
    purposeMix: { CLUE: 30, NOISE: 10, PRESSURE: 20 },
    promptGuidance: 'Gauge readings arrive late and disagree with each other.',
    ...over,
  }
}

afterEach(() => {
  setThreatFamilySource('toolkits', [])
  registerPackProfiles([])
})

describe('built-in families', () => {
  it('keep their ids and order', () => {
    const builtIn = new Set<string>(THREAT_FAMILY_IDS)
    // Bundled domain packs add their own families after the built-ins (tests/setup).
    expect(
      allThreatFamilies()
        .map((t) => t.id)
        .filter((id) => builtIn.has(id)),
    ).toEqual(THREAT_FAMILIES.map((t) => t.id))
    expect(THREAT_FAMILIES.map((t) => t.id).sort()).toEqual([...THREAT_FAMILY_IDS].sort())
  })

  it('are all registered and carry no pack-only fields', () => {
    for (const id of THREAT_FAMILY_IDS) {
      expect(isThreatFamilyId(id)).toBe(true)
      expect(threatFamily(id).purposeMix).toBeUndefined()
    }
    expect(isThreatFamilyId('river_flood')).toBe(false)
    expect(() => threatFamily('river_flood')).toThrow(/Unknown threat family/)
    expect(threatFamilyLabel('river_flood')).toBe('river_flood')
  })
})

describe('setThreatFamilySource', () => {
  it('adds families from any source after the built-ins', () => {
    const before = allThreatFamilies().length
    setThreatFamilySource('toolkits', [{ packId: 'org.example.hydro', families: [flood()] }])
    expect(allThreatFamilies().at(-1)?.id).toBe('river_flood')
    expect(allThreatFamilies()).toHaveLength(before + 1)
    expect(findThreatFamily('river_flood')?.label).toBe('River flood')
    expect(isThreatFamilyId('river_flood')).toBe(true)
  })

  it('replaces the source rather than adding to it', () => {
    setThreatFamilySource('toolkits', [{ packId: 'a', families: [flood()] }])
    setThreatFamilySource('toolkits', [])
    expect(isThreatFamilyId('river_flood')).toBe(false)
  })

  it('refuses a family that reuses a built-in id and keeps the previous set', () => {
    setThreatFamilySource('toolkits', [{ packId: 'a', families: [flood()] }])
    expect(() =>
      setThreatFamilySource('toolkits', [{ packId: 'b', families: [flood({ id: 'cyber' })] }]),
    ).toThrow(/built in/)
    expect(isThreatFamilyId('river_flood')).toBe(true)
    expect(threatFamily('cyber')).toBe(cyber)
  })

  it('refuses two packs providing one id, across sources', () => {
    setThreatFamilySource('toolkits', [{ packId: 'a', families: [flood()] }])
    expect(() => setThreatFamilySource('domains', [{ packId: 'b', families: [flood()] }])).toThrow(
      /also provided by a/,
    )
    expect(findThreatFamily('river_flood')).toBeDefined()
  })

  it('refuses a family that fails the schema', () => {
    expect(() =>
      setThreatFamilySource('toolkits', [{ packId: 'a', families: [flood({ phaseArc: [] })] }]),
    ).toThrow()
    expect(isThreatFamilyId('river_flood')).toBe(false)
  })
})

describe('AddedThreatFamilies', () => {
  it('accepts unique new ids', () => {
    expect(AddedThreatFamilies.safeParse([flood(), flood({ id: 'dam_overtop' })]).success).toBe(
      true,
    )
  })

  it('refuses duplicate ids, built-in ids and bad id shapes', () => {
    expect(AddedThreatFamilies.safeParse([flood(), flood()]).success).toBe(false)
    expect(AddedThreatFamilies.safeParse([flood({ id: 'insider' })]).success).toBe(false)
    expect(AddedThreatFamilies.safeParse([flood({ id: 'River Flood' })]).success).toBe(false)
  })

  it('refuses an unknown purpose tag in the mix', () => {
    const bad = { ...flood(), purposeMix: { NOT_A_TAG: 5 } }
    expect(AddedThreatFamilies.safeParse([bad]).success).toBe(false)
  })
})

describe('a domain pack adding a family', () => {
  const entry = () =>
    freightRailEntry('1.0.0', {
      threatFamilies: ['river_flood', 'cyber'],
      addedThreatFamilies: [flood()],
    })

  it('registers the family with the pack profile', () => {
    registerPackProfiles([entry()])
    expect(isThreatFamilyId('river_flood')).toBe(true)
    registerPackProfiles([])
    expect(isThreatFamilyId('river_flood')).toBe(false)
  })

  it('lists the added family for the profile, default first', () => {
    const profile = entry().profile
    registerPackProfiles([entry()])
    expect(profileThreatFamilies(profile).map((f) => f.id)).toEqual(['river_flood', 'cyber'])
    expect(resolveThreat(profile, undefined).id).toBe('river_flood')
  })

  it('lists an added family the domain does not list in threatFamilies', () => {
    const profile = freightRailProfile({ addedThreatFamilies: [flood()] })
    expect(profileThreatFamilies(profile).map((f) => f.id)).toEqual([
      'uas_drone',
      'cyber',
      'river_flood',
    ])
  })

  it('infers the added family from the brief text', () => {
    const profile = entry().profile
    registerPackProfiles([entry()])
    expect(chooseThreatFamily(profile, 'The levee is failing and inundation is spreading')).toBe(
      'river_flood',
    )
    expect(chooseThreatFamily(profile, 'phishing and ransomware')).toBe('cyber')
  })

  it('keeps working from the profile alone once the pack is gone', () => {
    const profile = entry().profile
    expect(isThreatFamilyId('river_flood')).toBe(false)
    expect(resolveThreat(profile, 'river_flood').label).toBe('River flood')
    expect(chooseThreatFamily(profile, 'levee inundation')).toBe('river_flood')
  })

  it('falls back to the default when a stored family is unknown', () => {
    const profile = freightRailProfile()
    expect(resolveThreat(profile, 'river_flood').id).toBe('uas_drone')
  })

  it('refuses a pack whose family clashes with another pack or a built-in', () => {
    setThreatFamilySource('toolkits', [{ packId: 'org.example.hydro', families: [flood()] }])
    expect(() => registerPackProfiles([entry()])).toThrow(/also provided by org.example.hydro/)
    expect(() =>
      registerPackProfiles([
        freightRailEntry('1.0.0', { addedThreatFamilies: [flood({ id: 'cyber' })] }),
      ]),
    ).toThrow()
  })
})

describe('inferThreatFamily', () => {
  it('uses extra families before the registry', () => {
    expect(inferThreatFamily('levee inundation', ['river_flood'], 'cyber', [flood()])).toBe(
      'river_flood',
    )
    expect(inferThreatFamily('levee inundation', ['river_flood'], 'cyber')).toBe('cyber')
  })
})

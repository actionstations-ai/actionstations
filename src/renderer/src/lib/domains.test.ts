import { afterEach, describe, expect, it } from 'vitest'
import {
  DOMAIN_PROFILES,
  builtinProfile,
  chooseThreatFamily,
  registerPackProfiles,
} from '@shared/domains'
import { freightRailEntry, freightRailProfile } from '@shared/domains/pack-fixtures'
import type { ScenarioIdea } from '@shared/schemas/scenario'
import {
  PACK_GROUP_LABEL,
  PROFILE_GROUP_IDS,
  ideaFamily,
  profileGroups,
  profileProvenance,
  resolveOrgType,
  suggestThreat,
  suggestionWhy,
  threatFamiliesFor,
} from './domains'

const brief = (userPrompt: string) => ({ userPrompt, learningObjectives: [], constraints: [] })
const idea = (over: Partial<ScenarioIdea> = {}): ScenarioIdea => ({
  id: 'i1',
  title: 'Quiet night',
  hook: 'Something happens',
  threat: '',
  systemsAffected: [],
  sectionsExercised: [],
  difficulty: 'intermediate',
  whyItTeaches: '',
  suggestedRoles: [],
  ...over,
})

describe('profile picker groups', () => {
  it('puts every built-in profile in exactly one group', () => {
    const grouped = PROFILE_GROUP_IDS.flatMap((g) => g.ids)
    expect([...grouped].sort()).toEqual(DOMAIN_PROFILES.map((p) => p.id).sort())
  })

  it('searches labels, descriptions and aliases', () => {
    const ids = (q: string) => profileGroups(q).flatMap((g) => g.profiles.map((p) => p.id))
    expect(ids('bus')).toContain('transit')
    expect(ids('hospital')).toEqual(['healthcare'])
    expect(ids('drone')).toContain('unmanned_systems')
    expect(ids('zzz')).toEqual([])
    expect(profileGroups('')).toHaveLength(PROFILE_GROUP_IDS.length)
  })
})

describe('resolveOrgType', () => {
  it('maps legacy values and aliases to their profile', () => {
    expect(resolveOrgType('hospital')).toMatchObject({ differs: true, unknown: false })
    expect(resolveOrgType('hospital').profile.id).toBe('healthcare')
    expect(resolveOrgType('utility').profile.id).toBe('energy_utility')
    expect(resolveOrgType('airport')).toMatchObject({ differs: false, unknown: false })
  })

  it('treats free text as generic and says so', () => {
    const r = resolveOrgType('Moon base')
    expect(r.profile.id).toBe('generic')
    expect(r.unknown).toBe(true)
  })
})

describe('pack profiles in the picker (#263)', () => {
  afterEach(() => registerPackProfiles([]))
  const snapshot = {
    profile: freightRailProfile(),
    packId: 'org.example.freight-rail',
    version: '1.0.0',
    packName: 'Freight Rail',
  }
  const packGroup = (q = '', snap?: typeof snapshot) =>
    profileGroups(q, snap).find((g) => g.label === PACK_GROUP_LABEL)

  it('lists enabled pack profiles in their own group, labelled with the pack', () => {
    expect(packGroup()).toBeUndefined()
    registerPackProfiles([freightRailEntry()])
    expect(packGroup()?.profiles.map((p) => p.id)).toEqual(['freight_rail'])
    expect(packGroup('railroad')?.profiles).toHaveLength(1)
    expect(profileProvenance('freight_rail')).toMatchObject({
      origin: 'pack',
      packName: 'Freight Rail',
    })
    expect(profileProvenance('transit')).toBeUndefined()
    expect(resolveOrgType('railroad')).toMatchObject({ unknown: false, differs: true })
  })

  it('keeps a project snapshot whose pack is gone, marked not installed', () => {
    expect(packGroup('', snapshot)?.profiles.map((p) => p.id)).toEqual(['freight_rail'])
    expect(profileProvenance('freight_rail', snapshot)).toMatchObject({
      origin: 'copy',
      packName: 'Freight Rail',
      packMissing: true,
      updateAvailable: false,
    })
    const r = resolveOrgType('freight_rail', snapshot)
    expect(r.profile.label).toBe('Freight railroad')
    expect(r.unknown).toBe(false)
    expect(resolveOrgType('freight_rail').profile.id).toBe('generic')
  })
})

describe('suggestThreat', () => {
  const transit = builtinProfile('transit')
  const dam = builtinProfile('water_dam')

  it('matches the pipeline: keyword hits among the profile families', () => {
    const text = 'Someone feeds fake positions into the CAD/AVL system'
    const s = suggestThreat(transit, brief(text))
    expect(s.id).toBe(chooseThreatFamily(transit, text))
    expect(s.reason).toEqual({ kind: 'keywords', words: expect.arrayContaining(['cad/avl']) })
    expect(suggestionWhy(s, transit)).toMatch(/mentions .*“cad\/avl”/)
  })

  it("falls back to the profile's default and says why", () => {
    const s = suggestThreat(dam, brief('A quiet Tuesday'))
    expect(s).toEqual({ id: 'cyber_physical', reason: { kind: 'default' } })
    expect(suggestionWhy(s, dam)).toMatch(/default for Dam \/ water authority projects/)
  })

  it("uses the idea's family when the profile supports it", () => {
    expect(suggestThreat(dam, brief(''), idea({ threatFamily: 'natural_hazard' })).reason).toEqual({
      kind: 'idea',
    })
    // mass_gathering is not a dam family: fall back to the text.
    expect(suggestThreat(dam, brief(''), idea({ threatFamily: 'mass_gathering' })).id).toBe(
      'cyber_physical',
    )
  })

  it('lists only the profile families, default first', () => {
    expect(threatFamiliesFor(dam).map((t) => t.id)).toEqual(dam.threatFamilies)
  })

  it("shows an idea's own family, else the one its text suggests", () => {
    expect(ideaFamily(idea({ threatFamily: 'insider' }), dam)).toBe('insider')
    expect(ideaFamily(idea({ hook: 'A drone over the spillway' }), dam)).toBe('uas_drone')
  })
})

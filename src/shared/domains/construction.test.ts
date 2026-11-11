// The construction domain profile (#824): its threat families and the checks a practitioner
// would make of the profile text (authority, placards, reporting clocks).
import { describe, expect, it } from 'vitest'
import {
  AddedThreatFamilies,
  bundledProfiles,
  builtinProfile,
  inferThreatFamily,
  profileThreatFamilies,
  resolveThreat,
  type DomainProfile,
} from './index'
import { CORE_CAPABILITIES } from '../core-capabilities'

const profile = (): DomainProfile => {
  const p = bundledProfiles().find((x) => x.id === 'construction')
  if (!p) throw new Error('construction profile is not bundled')
  return p
}

describe('construction profile', () => {
  it('adds valid, unique families and lists them all, the site emergency first', () => {
    const p = profile()
    expect(AddedThreatFamilies.safeParse(p.addedThreatFamilies).success).toBe(true)
    expect(profileThreatFamilies(p).map((f) => f.id)).toEqual([
      'construction_site_emergency',
      'structural_collapse_rescue',
      'post_disaster_inspection',
      'professional_dilemma',
      'site_security_theft',
      'construction_service_degradation',
      'natural_hazard',
      'infrastructure_failure',
    ])
    expect(resolveThreat(p, undefined).id).toBe('construction_site_emergency')
  })

  it('gives every added family a four-phase arc, decision points and guidance', () => {
    for (const f of profile().addedThreatFamilies ?? []) {
      expect(f.phaseArc, f.id).toHaveLength(4)
      expect(f.decisionPointExamples.length, f.id).toBeGreaterThanOrEqual(3)
      expect(f.promptGuidance?.length ?? 0, f.id).toBeGreaterThan(40)
    }
  })

  it('picks the family a brief describes', () => {
    const p = profile()
    const pick = (text: string) =>
      inferThreatFamily(
        text,
        p.threatFamilies,
        'construction_site_emergency',
        p.addedThreatFamilies ?? [],
      )
    expect(pick('A trench wall sloughs and the competent person pulls the crew')).toBe(
      'construction_site_emergency',
    )
    expect(pick('A partial collapse traps workers and rescue needs shoring')).toBe(
      'structural_collapse_rescue',
    )
    expect(
      pick('Rapid evaluation teams post a placard on each building after the earthquake'),
    ).toBe('post_disaster_inspection')
    expect(pick('The inspector finds a deficiency and the owner pressures the schedule')).toBe(
      'professional_dilemma',
    )
    expect(pick('Copper theft and trespass at the job site overnight')).toBe('site_security_theft')
    expect(pick('The data logger failure leaves a flat line on the tiltmeter')).toBe(
      'construction_service_degradation',
    )
  })

  it('keeps the authority and the reporting clocks right in the guidance', () => {
    const fam = (id: string) => (profile().addedThreatFamilies ?? []).find((f) => f.id === id)
    const site = fam('construction_site_emergency')?.promptGuidance ?? ''
    expect(site).toMatch(/8 hours/)
    expect(site).toMatch(/24 hours/)
    expect(site).toMatch(/5 feet/)
    expect(site).toMatch(/25 feet/)
    expect(site).toMatch(/20 feet deep or greater .* registered professional engineer/)
    const insp = fam('post_disaster_inspection')?.promptGuidance ?? ''
    expect(insp).toMatch(/Evaluators post placards as the building official's agents/)
    expect(insp).toMatch(/not a demolition order/)
    expect(insp).toMatch(/INSPECTED \(green\), RESTRICTED USE \(yellow\) and UNSAFE \(red\)/)
    expect(insp).toMatch(/at the time it was evaluated/)
    expect(profile().description).toMatch(/building official declares a building unsafe/)
    expect(fam('professional_dilemma')?.promptGuidance).toMatch(/no single right answer/)
  })

  it('names core capabilities that exist and resolves its aliases', () => {
    const ids = new Set<string>(CORE_CAPABILITIES.map((c) => c.id))
    for (const c of profile().coreCapabilities ?? []) expect(ids.has(c), c).toBe(true)
    for (const alias of ['general contractor', 'building department', 'trench', 'jobsite'])
      expect(builtinProfile(alias).id).toBe('construction')
  })

  it('suggests the earthquake and weather toolkits for shaking and wind', () => {
    expect(profile().suggestedToolkits).toEqual(
      expect.arrayContaining(['seismic', 'weather', 'media_environment']),
    )
  })
})

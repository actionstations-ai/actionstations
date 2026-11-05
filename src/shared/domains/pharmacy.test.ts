// The pharmacy domain (spec 0463 FR-1, FR-2): a profile built on the healthcare profile, four
// variants as role sets and the scenario families for drug supply exercises.
import { describe, expect, it } from 'vitest'
import {
  builtinProfile,
  bundledProfiles,
  chooseThreatFamily,
  profileThreatFamilies,
  resolveThreat,
} from './index'

const pharmacy = () => bundledProfiles().find((p) => p.id === 'pharmacy')!
const healthcare = () => bundledProfiles().find((p) => p.id === 'healthcare')!

const FAMILY_IDS = [
  'drug_shortage',
  'compounding_error',
  'controlled_substance_diversion',
  'cold_chain_failure',
  'drug_recall',
  'pharmacy_outage',
]

describe('pharmacy domain profile', () => {
  it('repeats the hospital outside parties and regulations it builds on', () => {
    // The profile format has no `extends` field (ADR-0085); this test keeps the copies in step.
    const parties = pharmacy().outsideParties.map((p) => p.toLowerCase())
    for (const party of [
      'CMS and the state department of health',
      'the Joint Commission',
      'local EMS and the regional trauma system',
    ])
      expect(parties, party).toContain(party.toLowerCase())
    expect(pharmacy().regulations).toEqual(expect.arrayContaining(['hipaa_breach']))
    expect(healthcare().suggestedToolkits).toContain('pharmacy')
  })

  it('carries the roles of all four variants', () => {
    const teams = new Set(pharmacy().roles.map((r) => r.team.split(':')[0]))
    expect([...teams].sort()).toEqual([
      'Community pharmacy',
      'Compounding',
      'Hospital pharmacy',
      'Vaccine program',
    ])
    const keys = pharmacy().roles.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of [
      'dop',
      'diversion_specialist',
      'pic',
      'designated_person',
      'vaccine_coordinator',
    ])
      expect(keys).toContain(key)
  })

  it('resolves the dossier aliases to pharmacy and leaves hospital on healthcare', () => {
    for (const alias of [
      'community pharmacy',
      'sterile compounding',
      'drug shortage',
      'vaccine cold chain',
    ])
      expect(builtinProfile(alias).id, alias).toBe('pharmacy')
    expect(builtinProfile('hospital').id).toBe('healthcare')
  })

  it('suggests the pharmacy toolkit and the two it reuses', () => {
    expect(pharmacy().suggestedToolkits).toEqual(
      expect.arrayContaining([
        'pharmacy',
        'clinical_care',
        'clinical_systems',
        'media_environment',
      ]),
    )
  })

  it('names the core capabilities of the spec', () => {
    expect(pharmacy().coreCapabilities).toEqual(
      expect.arrayContaining([
        'supply_chain_integrity_and_security',
        'logistics_and_supply_chain_management',
        'public_health_healthcare_and_emergency_medical_services',
      ]),
    )
  })
})

describe('pharmacy threat families', () => {
  it('adds the six families, none of them a built-in id', () => {
    expect(pharmacy().addedThreatFamilies!.map((f) => f.id)).toEqual(FAMILY_IDS)
  })

  it('lists them first, with the drug shortage as the default', () => {
    const ids = profileThreatFamilies(pharmacy()).map((f) => f.id)
    expect(ids).toEqual(expect.arrayContaining(FAMILY_IDS))
    expect(resolveThreat(pharmacy(), undefined).id).toBe('drug_shortage')
  })

  it('gives each family an arc, decisions and a purpose mix', () => {
    for (const family of pharmacy().addedThreatFamilies!) {
      expect(family.phaseArc.length, family.id).toBeGreaterThanOrEqual(5)
      for (const phase of family.phaseArc) expect(phase.beats.length).toBeGreaterThanOrEqual(3)
      expect(family.decisionPointExamples.length).toBeGreaterThanOrEqual(3)
      const total = Object.values(family.purposeMix ?? {}).reduce((a, b) => a + b, 0)
      expect(total, family.id).toBe(100)
      expect(family.promptGuidance).toBeTruthy()
    }
  })

  it('follows the dossier arcs for a shortage and a cold chain failure', () => {
    const arc = (id: string) =>
      pharmacy()
        .addedThreatFamilies!.find((f) => f.id === id)!
        .phaseArc.map((p) => p.title)
    expect(arc('drug_shortage')).toEqual([
      'Early signal',
      'Assessment',
      'Conservation and allocation',
      'Substitution and communication',
      'Sourcing, recovery and lessons',
    ])
    expect(arc('cold_chain_failure')[0]).toBe('Alarm')
    expect(arc('cold_chain_failure')).toContain('Viability decision')
  })

  it('states the DEA clocks the way 21 CFR 1301.76(b) does', () => {
    const guidance = pharmacy().addedThreatFamilies!.find(
      (f) => f.id === 'controlled_substance_diversion',
    )!.promptGuidance!
    expect(guidance).toMatch(/one business day/)
    expect(guidance).toMatch(/45 days/)
  })

  it('infers the family from the words of a brief', () => {
    const p = pharmacy()
    expect(
      chooseThreatFamily(p, 'A sole source IV fluid shortage and allocation at the hospital'),
    ).toBe('drug_shortage')
    expect(
      chooseThreatFamily(p, 'Freezer failure with vaccine storage temperature excursion'),
    ).toBe('cold_chain_failure')
    expect(chooseThreatFamily(p, 'Cabinet discrepancy and opioid diversion by one nurse')).toBe(
      'controlled_substance_diversion',
    )
    expect(chooseThreatFamily(p, 'Claims switch outage and manual claims at the counter')).toBe(
      'pharmacy_outage',
    )
    expect(chooseThreatFamily(p, 'A recall of a lot with quarantine and patient tracing')).toBe(
      'drug_recall',
    )
    expect(chooseThreatFamily(p, 'A compounded sterile batch that is out of specification')).toBe(
      'compounding_error',
    )
  })
})

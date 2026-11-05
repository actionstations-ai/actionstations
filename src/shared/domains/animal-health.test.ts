// The animal health domain profile (spec 0460 FR-1, FR-2): aliases, role sets for each setting,
// the nine threat families with the response arc, and the toolkits it suggests.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ToolkitSchema } from '../toolkits'
import { builtinProfile, findThreatFamily, inferThreatFamily } from './index'

const AH = builtinProfile('animal_health')

const FAMILIES = [
  'hpai_poultry',
  'hpai_dairy',
  'asf_introduction',
  'fmd_movement_control',
  'screwworm_incursion',
  'vnd_poultry',
  'animal_zoonotic_spillover',
  'disaster_animal_care',
  'animal_health_service_degradation',
]

describe('animal health domain profile', () => {
  it('resolves its aliases and leaves the food business to food_agriculture', () => {
    for (const key of ['state veterinarian', 'HPAI', 'county-fair', 'vet school', 'livestock'])
      expect(builtinProfile(key).id).toBe('animal_health')
    expect(builtinProfile('grain elevator').id).toBe('food_agriculture')
  })

  it('keeps role sets for each setting the spec names', () => {
    const teams = AH.roles.map((r) => r.team).join('|')
    expect(teams).toMatch(/State Animal Health Agency/)
    expect(teams).toMatch(/Producer or Integrator/)
    expect(teams).toMatch(/Veterinary Diagnostic Laboratory/)
    expect(teams).toMatch(/Extension and Fairs/)
    expect(teams).toMatch(/Disaster Animal Care/)
    expect(AH.roles.map((r) => r.abbreviation)).toEqual(
      expect.arrayContaining(['SAHO', 'IC', 'AVIC', 'EPI', 'MOVE', 'DEPOP', 'LAB', 'PROD', 'ASD']),
    )
  })

  it('registers the nine families, each with a usable arc', () => {
    expect(AH.threatFamilies).toEqual(FAMILIES)
    for (const id of AH.threatFamilies) {
      const family = findThreatFamily(id)
      expect(family, id).toBeDefined()
      expect(family!.phaseArc.length, id).toBeGreaterThanOrEqual(4)
      expect(family!.decisionPointExamples.length, id).toBeGreaterThanOrEqual(3)
      expect(family!.promptGuidance, id).toMatch(/fictional/)
    }
  })

  it('walks the response arc in order in the avian influenza family', () => {
    const titles = findThreatFamily('hpai_poultry')!.phaseArc.map((p) => p.title)
    expect(titles).toEqual([
      'Suspicion',
      'Presumptive positive',
      'Quarantine and zones',
      'Tracing and surveillance',
      'Depopulation and disposal',
      'Cleaning and release',
      'Recovery and trade',
    ])
  })

  it('picks the family from the brief by keywords', () => {
    const pick = (text: string) => inferThreatFamily(text, AH.threatFamilies, 'hpai_poultry')
    expect(pick('positive milk silo result and herd-level testing')).toBe('hpai_dairy')
    expect(pick('foot-and-mouth standstill with a vaccination zone')).toBe('fmd_movement_control')
    expect(pick('swine show at the county fair with african swine fever')).toBe('asf_introduction')
    expect(pick('animal shelter evacuation before the flood')).toBe('disaster_animal_care')
  })

  it('keeps pathogen handling out of the guidance', () => {
    for (const id of AH.threatFamilies) {
      const text = JSON.stringify(findThreatFamily(id)).toLowerCase()
      expect(text).not.toMatch(/enhanc|gain of function|culture protocol|aerosoliz/)
    }
  })

  it('suggests the animal disease toolkit and the ones it builds on', () => {
    expect(AH.suggestedToolkits).toEqual(
      expect.arrayContaining(['animal_disease', 'epidemiology', 'weather', 'flooding']),
    )
    expect(AH.suggestedToolkits).toContain('media_environment')
    const toolkit = ToolkitSchema.parse(
      JSON.parse(readFileSync(resolve('packs/toolkits/animal_disease.json'), 'utf8')),
    )
    expect(toolkit.appliesTo.domains).toContain('animal_health')
  })

  it('is suggested by the domains that reuse it', () => {
    for (const id of [
      'food_agriculture',
      'public_health',
      'municipal',
      'campus',
      'emergency_communications',
    ])
      expect(builtinProfile(id).suggestedToolkits, id).toContain('animal_disease')
  })
})

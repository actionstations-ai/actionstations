// The bundled humanitarian profile (#805): aliases, four variants as role sets, eight threat
// families with arcs, and the guardrails the staff security family carries.
import { describe, expect, it } from 'vitest'
import { builtinProfile, findThreatFamily, inferThreatFamily } from './index'

const HUM = builtinProfile('humanitarian')

const FAMILIES = [
  'humanitarian_sudden_onset',
  'humanitarian_refugee_influx',
  'humanitarian_site_outbreak',
  'humanitarian_staff_security',
  'humanitarian_pipeline_break',
  'humanitarian_funding_gap',
  'humanitarian_data_breach',
  'humanitarian_service_degradation',
]

describe('humanitarian domain profile', () => {
  it('resolves its aliases', () => {
    for (const key of [
      'NGO',
      'International Aid',
      'NGO country office',
      'camp-management',
      'humanitarian country team',
    ])
      expect(builtinProfile(key).id, key).toBe('humanitarian')
  })

  it('has a role set for each of the four variants', () => {
    const teams = [...new Set(HUM.roles.map((r) => r.team))]
    expect(teams).toEqual([
      'Team A: NGO country office',
      'Team B: Coordination (HCT and clusters)',
      'Team C: Response site',
      'Team D: Headquarters crisis management',
    ])
    const keys = HUM.roles.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('registers the eight families, sudden-onset first, each with a usable arc', () => {
    expect(HUM.threatFamilies).toEqual(FAMILIES)
    for (const id of FAMILIES) {
      const family = findThreatFamily(id)
      expect(family, id).toBeDefined()
      expect(family!.phaseArc.length, id).toBeGreaterThanOrEqual(4)
      expect(family!.decisionPointExamples.length, id).toBeGreaterThanOrEqual(1)
    }
  })

  it('walks the dossier arcs for a sudden-onset disaster and a staff security incident', () => {
    const arc = (id: string) => findThreatFamily(id)!.phaseArc.map((p) => p.title)
    expect(arc('humanitarian_sudden_onset')).toEqual([
      'Alert and first reports',
      'First 24 hours',
      'First 72 hours',
      'First weeks',
      'Transition',
    ])
    expect(arc('humanitarian_staff_security')).toEqual([
      'Incident report',
      'Team activation',
      'Family liaison and information control',
      'Resolution decisions',
      'Recovery and review',
    ])
  })

  it('uses the refugee coordination model, not cluster activation, for an influx', () => {
    const guidance = findThreatFamily('humanitarian_refugee_influx')!.promptGuidance!
    expect(guidance).toMatch(/refugee coordination model/)
    expect(guidance).toMatch(/do not activate clusters/)
  })

  it('keeps staff security at the level of decisions and communications', () => {
    const guidance = findThreatFamily('humanitarian_staff_security')!.promptGuidance!
    expect(guidance).toMatch(/Do not write negotiation tactics, ransom amounts or mechanics/)
    expect(guidance).toMatch(/techniques for evading or resisting detention/)
    expect(guidance).toMatch(/does not make the UN responsible for an NGO's security/)
  })

  it('picks the family from the brief by keywords', () => {
    const pick = (text: string) =>
      inferThreatFamily(text, HUM.threatFamilies, 'humanitarian_sudden_onset')
    expect(pick('cholera cases in the camp and a treatment centre')).toBe(
      'humanitarian_site_outbreak',
    )
    expect(pick('a staff member was detained at a checkpoint')).toBe('humanitarian_staff_security')
    expect(pick('customs hold and a pipeline break for the food programme')).toBe(
      'humanitarian_pipeline_break',
    )
    expect(pick('thousands of refugees cross the border, registration is behind')).toBe(
      'humanitarian_refugee_influx',
    )
  })

  it('suggests the toolkits it reuses', () => {
    expect(HUM.suggestedToolkits).toEqual(
      expect.arrayContaining(['humanitarian', 'epidemiology', 'media_environment']),
    )
  })
})

// The bundled research_labs profile (#868, spec 0466): aliases, variants as role sets, eight
// families that share the seven-phase incident arc, and guidance that stays at the level of
// organizational response.
import { describe, expect, it } from 'vitest'
import { builtinProfile, findThreatFamily, inferThreatFamily } from './index'

const LABS = builtinProfile('research_labs')

describe('research_labs domain profile', () => {
  it('resolves its aliases', () => {
    for (const key of [
      'biosafety',
      'BSO',
      'responsible official',
      'select agent',
      'vivarium',
      'IBC',
    ])
      expect(builtinProfile(key).id).toBe('research_labs')
  })

  it('suggests the lab safety, epidemiology and media toolkits', () => {
    expect(LABS.suggestedToolkits).toEqual(['lab_safety', 'epidemiology', 'media_environment'])
  })

  it('keeps roles for each setting: registered entity, laboratory, animal facility, clinical or core lab', () => {
    const roles = LABS.roles.map((r) => r.key)
    for (const key of [
      'ro',
      'aro',
      'bso',
      'ibc',
      'pi',
      'lm',
      'oh',
      'rc',
      'rit',
      'fac',
      'afd',
      'cfm',
    ])
      expect(roles).toContain(key)
    const teams = LABS.roles.map((r) => r.team).join('|')
    expect(teams).toMatch(/Registration/)
    expect(teams).toMatch(/Animal Care/)
    expect(teams).toMatch(/Laboratory/)
  })

  it('registers the eight families the spec lists, each with the seven-phase arc', () => {
    expect(LABS.threatFamilies).toEqual([
      'lab_exposure',
      'lab_inventory_discrepancy',
      'lab_sample_loss',
      'lab_facility_emergency',
      'lab_animal_facility_emergency',
      'lab_data_breach',
      'lab_workplace_threat',
      'lab_service_degradation',
    ])
    for (const id of LABS.threatFamilies) {
      const family = findThreatFamily(id)
      expect(family, id).toBeDefined()
      expect(
        family!.phaseArc.map((p) => p.title),
        id,
      ).toEqual([
        'Discovery',
        'Immediate actions and containment',
        'Classify and notify',
        'Investigate',
        'Written reports',
        'Corrective action',
        'Return to work',
      ])
      expect(family!.decisionPointExamples.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('picks the family from the brief by keywords', () => {
    const pick = (text: string) => inferThreatFamily(text, LABS.threatFamilies, 'lab_exposure')
    expect(pick('a count of the select agent vials does not match the inventory record')).toBe(
      'lab_inventory_discrepancy',
    )
    expect(pick('a freezer alarm went unanswered over the weekend')).toBe('lab_sample_loss')
    expect(pick('ransomware on an instrument computer with participant data')).toBe(
      'lab_data_breach',
    )
    expect(pick('a needlestick in the lab')).toBe('lab_exposure')
  })

  it('keeps agent handling out of the guidance', () => {
    for (const id of LABS.threatFamilies) {
      const guidance = findThreatFamily(id)!.promptGuidance ?? ''
      expect(guidance).toMatch(/no technique/i)
    }
  })
})

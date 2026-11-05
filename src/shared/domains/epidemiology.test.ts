// The bundled epidemiology profile (#832): aliases, its own threat families and arcs, and the
// public health relationship.
import { describe, expect, it } from 'vitest'
import { builtinProfile, findThreatFamily, inferThreatFamily } from './index'

const EPI = builtinProfile('epidemiology')

describe('epidemiology domain profile', () => {
  it('resolves its aliases and leaves the health department to public_health', () => {
    for (const key of ['epi', 'Infection Prevention', 'contact-tracing', 'public health lab'])
      expect(builtinProfile(key).id).toBe('epidemiology')
    expect(builtinProfile('Health Department').id).toBe('public_health')
    expect(builtinProfile('PHEP').id).toBe('public_health')
  })

  it('suggests the epidemiology toolkit and keeps variant roles for each setting', () => {
    expect(EPI.suggestedToolkits).toEqual(['epidemiology'])
    const teams = EPI.roles.map((r) => r.team).join('|')
    expect(teams).toMatch(/Hospital Infection Prevention/)
    expect(teams).toMatch(/Laboratory/)
    expect(teams).toMatch(/Academic Program/)
  })

  it('registers the eight families the spec lists, each with a usable arc', () => {
    const ids = EPI.threatFamilies
    expect(ids).toEqual([
      'foodborne_outbreak',
      'respiratory_spread',
      'vaccine_preventable_exposure',
      'hai_cluster',
      'mass_prophylaxis',
      'surveillance_signal',
      'laboratory_surge',
      'epi_service_degradation',
    ])
    for (const id of ids) {
      const family = findThreatFamily(id)
      expect(family, id).toBeDefined()
      expect(family!.phaseArc.length).toBeGreaterThanOrEqual(4)
      expect(family!.decisionPointExamples.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('walks the investigation steps in order in the foodborne arc', () => {
    const titles = findThreatFamily('foodborne_outbreak')!.phaseArc.map((p) => p.title)
    expect(titles).toEqual([
      'Signal',
      'Verify and define cases',
      'Describe by time, place and person',
      'Hypothesis',
      'Control',
      'Communicate',
      'Close and after-action',
    ])
  })

  it('picks the family from the brief by keywords', () => {
    const pick = (text: string) => inferThreatFamily(text, EPI.threatFamilies, 'foodborne_outbreak')
    expect(pick('measles case on a flight with an exposure notice for a school')).toBe(
      'vaccine_preventable_exposure',
    )
    expect(pick('wastewater activity level rises in one sewershed')).toBe('surveillance_signal')
    expect(pick('candida auris cluster and unit closure')).toBe('hai_cluster')
    expect(pick('point of dispensing queue and throughput')).toBe('mass_prophylaxis')
  })

  it('keeps pathogen handling out of the guidance', () => {
    for (const id of EPI.threatFamilies) {
      const text = JSON.stringify(findThreatFamily(id)).toLowerCase()
      expect(text).not.toMatch(/enhanc|gain of function|culture protocol|aerosoliz/)
    }
  })
})

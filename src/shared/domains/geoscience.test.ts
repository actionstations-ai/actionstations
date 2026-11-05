// The geoscience domain profile (#669): its threat families and the checks a specialist reader
// would make of the profile text.
import { describe, expect, it } from 'vitest'
import {
  AddedThreatFamilies,
  bundledProfiles,
  inferThreatFamily,
  profileThreatFamilies,
  resolveThreat,
  type DomainProfile,
} from './index'
import { INJECT_TYPE_IDS } from '../taxonomy'

const profile = (): DomainProfile => {
  const p = bundledProfiles().find((x) => x.id === 'geoscience')
  if (!p) throw new Error('geoscience profile is not bundled')
  return p
}

describe('geoscience profile', () => {
  it('adds valid, unique families and lists them all, the earthquake first', () => {
    const p = profile()
    expect(AddedThreatFamilies.safeParse(p.addedThreatFamilies).success).toBe(true)
    expect(profileThreatFamilies(p).map((f) => f.id)).toEqual([
      'earthquake',
      'volcanic_unrest',
      'tsunami',
      'debris_flow',
      'ground_failure',
      'geo_service_degradation',
    ])
    expect(resolveThreat(p, undefined).id).toBe('earthquake')
  })

  it('gives every family a four-phase arc, decision points and guidance', () => {
    for (const f of profile().addedThreatFamilies ?? []) {
      expect(f.phaseArc, f.id).toHaveLength(4)
      expect(f.decisionPointExamples.length, f.id).toBeGreaterThanOrEqual(2)
      expect(f.promptGuidance?.length ?? 0, f.id).toBeGreaterThan(40)
    }
  })

  it('picks the family a brief describes', () => {
    const p = profile()
    const pick = (text: string) =>
      inferThreatFamily(text, p.threatFamilies, 'earthquake', p.addedThreatFamilies ?? [])
    expect(pick('The volcano alert level goes to Watch with an aviation color code')).toBe(
      'volcanic_unrest',
    )
    expect(pick('A local tsunami warning and a tide gauge record')).toBe('tsunami')
    expect(pick('Rain on the burn scar threatens a debris flow')).toBe('debris_flow')
    expect(pick('Liquefaction and lateral spreading at the port')).toBe('ground_failure')
    expect(pick('A false alert stopped the trains after a telemetry outage')).toBe(
      'geo_service_degradation',
    )
  })

  it('keeps the specialist rules in the family guidance', () => {
    const fam = (id: string) => (profile().addedThreatFamilies ?? []).find((f) => f.id === id)
    expect(fam('earthquake')?.promptGuidance).toMatch(/Mw.*MMI/s)
    expect(fam('volcanic_unrest')?.promptGuidance).toMatch(/color code/i)
    expect(fam('tsunami')?.promptGuidance).toMatch(/watch is not sent as a Wireless Emergency/i)
  })

  it('names only built-in inject types and covers the four variants with roles', () => {
    const p = profile()
    for (const t of p.injectTypes) expect(INJECT_TYPE_IDS, t).toContain(t)
    const text = p.roles.map((r) => r.description).join(' ')
    for (const v of [
      'Volcano observatory',
      'Seismic network',
      'Tsunami warning center',
      'Geological survey',
    ])
      expect(text, v).toContain(v)
  })
})

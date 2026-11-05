// The wildfire domain content (spec 0461 FR-1, FR-2): valid against the schema, with the
// threat families and arcs the research dossier names, and consistent with the other packs.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile, THREAT_FAMILY_IDS } from '@shared/domains/schema'

const read = (p: string): unknown => JSON.parse(readFileSync(resolve(p), 'utf8'))
const domain = DomainProfile.parse(read('packs/domains/wildfire.json'))
const added = (domain.addedThreatFamilies ?? []).map((f) => f.id)

describe('wildfire domain', () => {
  it('adds the hazard and service degradation families the spec names', () => {
    expect(added).toEqual(
      expect.arrayContaining([
        'wildfire_wui',
        'wildfire_red_flag_psps',
        'wildfire_smoke',
        'wildfire_resource_shortage',
        'wildfire_flood_after_fire',
        'wildfire_service_degradation',
      ]),
    )
  })
  it('defaults to the wildland-urban interface fire', () => {
    expect(domain.threatFamilies[0]).toBe('wildfire_wui')
  })
  it('lists every family it adds and no built-in id is redefined', () => {
    for (const id of added) {
      expect(domain.threatFamilies).toContain(id)
      expect(THREAT_FAMILY_IDS as readonly string[]).not.toContain(id)
    }
  })
  it('gives each added family a four-phase arc', () => {
    for (const f of domain.addedThreatFamilies ?? []) {
      expect(f.phaseArc, f.id).toHaveLength(4)
      for (const phase of f.phaseArc) expect(phase.beats.length, f.id).toBeGreaterThanOrEqual(3)
    }
  })
  it('follows the PSPS arc: forecast, notification, de-energization, restoration', () => {
    const psps = domain.addedThreatFamilies?.find((f) => f.id === 'wildfire_red_flag_psps')
    expect(psps?.phaseArc.map((p) => p.title)).toEqual([
      'Forecast and watch',
      'Notification windows',
      'De-energization',
      'Restoration and report',
    ])
    expect(psps?.promptGuidance).toMatch(/48 to 72 hours/)
    expect(psps?.promptGuidance).toMatch(/California/)
  })
  it('states the AQI scale the smoke family must use', () => {
    const smoke = domain.addedThreatFamilies?.find((f) => f.id === 'wildfire_smoke')
    expect(smoke?.promptGuidance).toMatch(/6 May 2024/)
  })
  it('has roles for all three variants and the fact categories zones and circuits', () => {
    const abbreviations = domain.roles.map((r) => r.abbreviation)
    expect(abbreviations).toEqual(expect.arrayContaining(['IC', 'LE', 'EM', 'PIO', 'PSPS-IC']))
    expect(domain.factCategories.map((c) => c.id)).toEqual(
      expect.arrayContaining(['zones', 'circuits']),
    )
  })
  it('suggests weather, flooding and debris flows beside its own toolkit', () => {
    for (const id of ['wildfire', 'weather', 'flooding', 'debris_flow', 'media_environment'])
      expect(domain.suggestedToolkits).toContain(id)
  })
  it('names the core capabilities from the spec', () => {
    expect(domain.coreCapabilities).toEqual(
      expect.arrayContaining(['public_information_and_warning', 'fire_management_and_suppression']),
    )
  })
})

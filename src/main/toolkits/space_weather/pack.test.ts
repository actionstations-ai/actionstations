// The space weather domain and toolkit content (spec 0468 FR-1, FR-2): valid against the
// schemas, consistent with each other, and within the generator's knowledge budget.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile } from '@shared/domains/schema'
import { CORE_CAPABILITIES } from '@shared/core-capabilities'
import {
  KNOWLEDGE_PER_TOOLKIT_CAP,
  ToolkitSchema,
  suggestToolkits,
  toolkitKnowledge,
} from '@shared/toolkits'

const read = (p: string): unknown => JSON.parse(readFileSync(resolve(p), 'utf8'))
const domain = DomainProfile.parse(read('packs/domains/space_weather.json'))
const toolkit = ToolkitSchema.parse(read('packs/toolkits/space_weather.json'))

const FAMILIES = [
  'space_geomagnetic_storm',
  'space_radiation_storm',
  'space_radio_blackout',
  'space_combined_event',
  'space_gnss_timing_loss',
  'space_satellite_anomaly',
  'space_service_degradation',
]

describe('space weather domain', () => {
  it('defines the seven families and the default is the geomagnetic storm', () => {
    expect((domain.addedThreatFamilies ?? []).map((f) => f.id)).toEqual(FAMILIES)
    expect(domain.threatFamilies[0]).toBe('space_geomagnetic_storm')
    for (const id of FAMILIES) expect(domain.threatFamilies).toContain(id)
  })
  it('gives each added family a four-phase arc and decision points', () => {
    for (const f of domain.addedThreatFamilies ?? []) {
      expect(f.phaseArc, f.id).toHaveLength(4)
      expect(f.decisionPointExamples.length, f.id).toBeGreaterThanOrEqual(1)
    }
  })
  it('keeps the grid, satellite and timing variants as role teams', () => {
    const teams = domain.roles.map((r) => r.team).join('|')
    expect(teams).toMatch(/Grid Control Room/)
    expect(teams).toMatch(/Satellite Operations/)
    expect(teams).toMatch(/Timing and Network/)
  })
  it('names only real core capabilities', () => {
    const known = CORE_CAPABILITIES.map((c) => c.id as string)
    for (const c of domain.coreCapabilities ?? []) expect(known, c).toContain(c)
  })
  it('suggests the toolkit, weather and the media environment', () => {
    expect(domain.suggestedToolkits).toEqual(
      expect.arrayContaining(['space_weather', 'weather', 'media_environment']),
    )
  })
})

describe('space weather toolkit', () => {
  it('ships a template folder with a taxonomy block for every inject type it adds', () => {
    for (const t of toolkit.injectTypes) {
      expect(existsSync(resolve(`templates/injects/${t}/template.html`)), t).toBe(true)
      const meta = read(`templates/injects/${t}/meta.json`) as { taxonomy?: unknown }
      expect(meta.taxonomy, `${t} needs a taxonomy block`).toBeTruthy()
    }
  })
  it('fits the knowledge budget without cutting a line', () => {
    const { text, truncated } = toolkitKnowledge([toolkit])
    expect(truncated).toEqual([])
    expect(text.length).toBeLessThan(KNOWLEDGE_PER_TOOLKIT_CAP)
  })
  it('states the scale mappings and the regional, uncertain nature of impacts', () => {
    const text = JSON.stringify(toolkit.knowledge)
    expect(text).toMatch(/G1 is Kp 5/)
    expect(text).toMatch(/R3 is X1/)
    expect(text).toMatch(/uncertain by hours/)
    expect(text).toMatch(/regional/)
  })
  it('is proposed for a storm brief', () => {
    const picked = suggestToolkits({
      available: [toolkit],
      active: [],
      text: 'A severe geomagnetic storm and GNSS timing holdover at a transmission operator',
      domainId: 'energy_utility',
    })
    expect(picked.map((t) => t.toolkitId)).toEqual(['space_weather'])
  })
  it('applies only to bundled domains, and each of them suggests it', () => {
    const domains = readdirSync(resolve('packs/domains')).map((f) => f.replace(/\.json$/, ''))
    for (const d of toolkit.appliesTo.domains) {
      expect(domains, d).toContain(d)
      const profile = DomainProfile.parse(read(`packs/domains/${d}.json`))
      expect(profile.suggestedToolkits, d).toContain('space_weather')
    }
  })
})

describe('space weather library', () => {
  const manifest = read('packs/documents/manifest.json') as {
    libraries: Record<string, { domain: string }>
    documents: { pack: string; slug: string; license: string; sha256: string | null }[]
    links: { pack: string; title: string; reason: string }[]
  }
  const lib = manifest.documents.filter((d) => d.pack === 'space-weather-library')
  it("bundles pinned documents, federal or under their publisher's terms, and explains every link", () => {
    expect(manifest.libraries['space-weather-library']?.domain).toBe('space_weather')
    expect(lib.length).toBeGreaterThan(0)
    for (const d of lib) {
      expect(['LicenseRef-US-Government-Work', 'LicenseRef-Publisher-Terms']).toContain(d.license)
      expect(d.sha256, d.slug).toMatch(/^[0-9a-f]{64}$/)
    }
    expect(
      lib.filter((d) => d.license === 'LicenseRef-Publisher-Terms').map((d) => d.slug),
    ).toEqual(['jhuapl-space-weather-ttx-2024-summary', 'nerc-eop-010-1', 'nerc-tpl-007-4'])
    const links = manifest.links.filter((l) => l.pack === 'space-weather-library')
    expect(links.length).toBeGreaterThan(0)
    for (const l of links) expect(l.reason.length, l.title).toBeGreaterThan(10)
  })
  it('is what the toolkit points to', () => {
    expect(toolkit.documents.length).toBeGreaterThan(0)
    for (const ref of toolkit.documents) {
      expect(ref.packId).toBe('ai.actionstations.space-weather-library')
      expect(lib.map((d) => d.slug)).toContain(ref.documentId)
    }
  })
})

// The bundled meteorology domain and weather toolkit (#657, spec 0449): the files parse, the
// threat families behave, and the toolkit's knowledge fits the generator's cap.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  builtinProfile,
  chooseThreatFamily,
  domainProfileRegexProblems,
  profileThreatFamilies,
  resolveThreat,
} from '@shared/domains'
import { existsSync } from 'node:fs'
import { fieldLintIssues, fieldLintRuleIds } from './lint-rules'
import { ToolkitSchema, suggestToolkits, toolkitKnowledge } from '@shared/toolkits'

const root = join(__dirname, '../../..')
const json = (rel: string): unknown => JSON.parse(readFileSync(join(root, rel), 'utf8'))

const toolkit = ToolkitSchema.parse(json('packs/toolkits/weather.json'))
const meteorology = builtinProfile('meteorology')

describe('meteorology domain profile', () => {
  it('is registered with its aliases', () => {
    expect(meteorology.id).toBe('meteorology')
    for (const alias of ['forecast office', 'WFO', 'TV weather', 'Weather Desk'])
      expect(builtinProfile(alias).id, alias).toBe('meteorology')
  })

  it('has valid regular expressions', () => {
    expect(domainProfileRegexProblems(meteorology)).toEqual([])
  })

  it('carries role sets for a forecast office, a broadcast team and an embedded meteorologist', () => {
    const teams = new Set(meteorology.roles.map((r) => r.team))
    expect([...teams].some((t) => t.startsWith('Forecast office'))).toBe(true)
    expect([...teams]).toContain('Broadcast weather team')
    expect([...teams]).toContain('Embedded meteorology')
    expect(new Set(meteorology.roles.map((r) => r.key)).size).toBe(meteorology.roles.length)
  })

  it('suggests the weather toolkit', () => {
    expect(meteorology.suggestedToolkits).toContain(toolkit.id)
  })
})

describe('meteorology threat families', () => {
  const added = meteorology.addedThreatFamilies ?? []

  it('adds the hazard families and the service degradation family', () => {
    expect(added.map((f) => f.id)).toEqual([
      'wx_convective_outbreak',
      'wx_flash_flood',
      'wx_tropical_cyclone',
      'wx_winter_storm',
      'wx_extreme_heat',
      'wx_fire_weather',
      'wx_aviation_weather',
      'wx_service_degradation',
    ])
  })

  it('lists every added family and defaults to the convective outbreak', () => {
    for (const f of added) expect(meteorology.threatFamilies).toContain(f.id)
    expect(resolveThreat(meteorology, undefined).id).toBe('wx_convective_outbreak')
    expect(profileThreatFamilies(meteorology).length).toBeGreaterThan(added.length)
  })

  it('gives the warning operations family its six-phase arc', () => {
    const arc = added.find((f) => f.id === 'wx_convective_outbreak')!.phaseArc.map((p) => p.title)
    expect(arc).toEqual([
      'Outlook',
      'Environment',
      'Watch',
      'Warnings',
      'Reports and verification',
      'Survey and recovery',
    ])
  })

  it.each([
    ['A tornado warning for a supercell moving toward the county seat', 'wx_convective_outbreak'],
    ['Training storms bring a flash flood and a water rescue', 'wx_flash_flood'],
    ['Hurricane watch and a forecast cone over the coast; evacuation order', 'wx_tropical_cyclone'],
    ['A blizzard and freezing rain close the interstate', 'wx_winter_storm'],
    ['A heat wave with a heat advisory and cooling centers', 'wx_extreme_heat'],
    ['A red flag warning and a spot forecast for the fire', 'wx_fire_weather'],
    ['A TAF amendment and a ground stop for crosswinds', 'wx_aviation_weather'],
    [
      'A radar outage and a service backup request to the neighboring office',
      'wx_service_degradation',
    ],
  ])('chooses the family for "%s"', (text, family) => {
    expect(chooseThreatFamily(meteorology, text)).toBe(family)
  })

  it('requires a clue only where the service itself is the problem', () => {
    const clueRequired = added.filter((f) => f.lint.clueRequired).map((f) => f.id)
    expect(clueRequired).toEqual(['wx_service_degradation'])
  })
})

describe('weather toolkit', () => {
  it('parses and names no code that does not exist yet', () => {
    expect(toolkit.id).toBe('weather')
    expect(toolkit.appliesTo.domains).toContain('meteorology')
  })

  it('has knowledge that fits the generator cap without being cut', () => {
    const { text, truncated } = toolkitKnowledge([toolkit])
    expect(truncated).toEqual([])
    expect(text).toContain('Realism rules')
    expect(text).toContain('LAT...LON')
  })

  it('is proposed for a weather brief and for an airport', () => {
    const base = { available: [toolkit], active: [], domainId: 'airport', text: '' }
    expect(
      suggestToolkits({ ...base, text: 'A derecho crosses the airfield at shift change.' })[0]
        ?.reason,
    ).toMatch(/derecho/)
    expect(suggestToolkits({ ...base, profileSuggested: ['weather'] })[0]?.toolkitId).toBe(
      'weather',
    )
  })
})

describe('weather product templates', () => {
  it('ships a template for each added inject type, and its preview passes the toolkit lint rules', () => {
    const builtin = new Set(['nws_weather_warning', 'cap_alert', 'eas_broadcast'])
    for (const type of toolkit.injectTypes) {
      const dir = `templates/injects/${type}`
      expect(existsSync(join(root, dir, 'template.html')), type).toBe(true)
      const preview = json(`${dir}/preview.json`) as { fields: Record<string, unknown> }
      expect(fieldLintIssues(type, preview.fields), type).toEqual([])
      if (!builtin.has(type)) {
        const meta = json(`${dir}/meta.json`) as { taxonomy?: unknown }
        expect(meta.taxonomy, `${type} taxonomy`).toBeDefined()
      }
    }
  })

  it('names only lint rules the app registers', () => {
    for (const id of toolkit.lintRules) expect(fieldLintRuleIds(), id).toContain(id)
  })
})

describe('reuse by other domains', () => {
  const reuse = [
    'airport',
    'energy_utility',
    'food_agriculture',
    'stadium_venue',
    'k12_schools',
    'transit',
    'freight_rail',
    'port_maritime',
    'public_health',
    'municipal',
    'emergency_communications',
  ]

  it.each(reuse)('%s suggests the weather toolkit, which names it back', (id) => {
    expect(builtinProfile(id).suggestedToolkits, id).toContain('weather')
    expect(toolkit.appliesTo.domains).toContain(id)
  })

  it('adds the CAP and EAS templates to emergency communications and municipal profiles', () => {
    for (const id of ['emergency_communications', 'municipal'])
      expect(builtinProfile(id).injectTypes).toEqual(
        expect.arrayContaining(['cap_alert', 'eas_broadcast']),
      )
  })
})

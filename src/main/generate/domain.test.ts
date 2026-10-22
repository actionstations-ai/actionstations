import { describe, expect, it } from 'vitest'
import type { ScenarioBrief, ScenarioIdea } from '@shared/schemas'
import { builtinProfile } from '@shared/domains'
import { referenceTexts } from '../../../tests/fixtures/domains/fake-index'
import {
  briefWithThreat,
  categoriesForProfile,
  compileCategory,
  domainContext,
  domainVars,
  roleHeuristics,
  singular,
  threatVars,
} from './domain'
import { DEFAULT_FACT_CATEGORIES } from './facility-categories'
import {
  extractFacilityFacts,
  facilitySheet,
  factEntries,
  factIds,
  unknownFacilityIds,
} from './facility'

const brief = (userPrompt: string): ScenarioBrief => ({
  userPrompt,
  audience: [],
  durationHours: 4,
  phaseCount: 4,
  learningObjectives: [],
  constraints: [],
})

describe('categoriesForProfile', () => {
  it('reproduces the airport defaults on reference/ncia (no regression for NCIA)', () => {
    const texts = referenceTexts('reference/ncia')
    const legacy = extractFacilityFacts(texts, DEFAULT_FACT_CATEGORIES)
    const viaProfile = extractFacilityFacts(texts, categoriesForProfile(builtinProfile('airport')))
    for (const id of [
      'runways',
      'taxiways',
      'gates',
      'concourses',
      'locations',
      'hosts',
      'networks',
      'phones',
    ]) {
      expect(factIds(viaProfile, id), id).toEqual(factIds(legacy, id))
    }
    expect(factEntries(viaProfile, 'agencies')).toEqual(
      expect.arrayContaining(factEntries(legacy, 'agencies')),
    )
    expect(facilitySheet(viaProfile).find((l) => l.startsWith('Gates'))).toBe(
      facilitySheet(legacy).find((l) => l.startsWith('Gates')),
    )
    expect(
      unknownFacilityIds('Lights on Runway 17 and Taxiway Echo near Gate C12', viaProfile).map(
        (u) => `${u.kind}:${u.id}`,
      ),
    ).toEqual(['runway:17', 'taxiway:E', 'gate:C12'])
  })

  it('extracts transit identifiers from reference/transit and lints against them', () => {
    const facts = extractFacilityFacts(
      referenceTexts('reference/transit'),
      categoriesForProfile(builtinProfile('transit')),
    )
    expect(factIds(facts, 'routes')).toEqual(expect.arrayContaining(['14', '22', '41']))
    expect(factIds(facts, 'lines')).toEqual(expect.arrayContaining(['BLUE', 'GREEN']))
    expect(factIds(facts, 'depots').some((d) => /NORTHSIDE DEPOT/.test(d))).toBe(true)
    expect(factEntries(facts, 'hosts')).toEqual(expect.arrayContaining(['RRTA-CAD-APP01']))
    expect(factEntries(facts, 'networks').some((n) => n.startsWith('10.72.'))).toBe(true)
    expect(factEntries(facts, 'agencies')).toEqual(expect.arrayContaining(['FTA', 'NTSB']))
    const sheet = facilitySheet(facts)
    expect(sheet.find((l) => l.startsWith('Bus routes'))).toMatch(
      /^Bus routes \(the complete list\): .*14/,
    )
    expect(sheet.some((l) => l.startsWith('Runways'))).toBe(false)
    const unknown = unknownFacilityIds(
      'Route 88 is detoured past the Elm Street Depot; Route 14 is fine',
      facts,
    )
    expect(unknown.map((u) => `${u.kind}:${u.id}`)).toEqual([
      'bus route:88',
      'depot / yard / transit center:ELM STREET DEPOT',
    ])
    expect(unknown[0]!.known).toContain('14')
  })

  it('extracts dam identifiers from reference/dam, including RTU/PLC tokens and communities', () => {
    const facts = extractFacilityFacts(
      referenceTexts('reference/dam'),
      categoriesForProfile(builtinProfile('water_dam')),
    )
    expect(factIds(facts, 'spillway_gates')).toEqual(
      expect.arrayContaining(['1', '2', '3', '4', '5']),
    )
    expect(factIds(facts, 'units')).toEqual(expect.arrayContaining(['1', '2']))
    expect(factIds(facts, 'controllers')).toEqual(expect.arrayContaining(['RTU-01', 'PLC-1']))
    expect(factIds(facts, 'zones')).toEqual(expect.arrayContaining(['A', 'B', 'C']))
    expect(factIds(facts, 'communities').some((c) => /MILFORD/.test(c))).toBe(true)
    expect(factEntries(facts, 'hosts')).toEqual(expect.arrayContaining(['CRD-SCADA-SRV01']))
    expect(factEntries(facts, 'agencies')).toEqual(expect.arrayContaining(['FERC']))
    expect(
      unknownFacilityIds('Open Spillway Gate 7 and reset RTU-12; Unit 2 is online', facts).map(
        (u) => `${u.kind}:${u.id}`,
      ),
    ).toEqual(['spillway gate:7', 'RTU / PLC:RTU-12'])
  })

  it('compiles the four identifier shapes', () => {
    const alnum = compileCategory({
      id: 'bays',
      label: 'Bays',
      noun: 'Bays?',
      idShape: 'alnum',
      lint: true,
      complete: true,
    })
    const facts = extractFacilityFacts(
      ['Buses load at Bays A1–A4 and B1. Bay Z9 does not exist.'],
      [alnum],
    )
    expect(factIds(facts, 'bays')).toEqual(['A1', 'A2', 'A3', 'A4', 'B1'])
    expect([...alnum.mentions!('Bay A2, Bay Alpha, Bay Z9, Bay agent')]).toEqual(['A2', 'A', 'Z9'])
    const number = compileCategory({
      id: 'units',
      label: 'Units',
      noun: 'Units?',
      idShape: 'number',
      lint: true,
      complete: true,
    })
    expect(
      factIds(extractFacilityFacts(['Units 1, 2 and 3; Unit #4.'], [number]), 'units'),
    ).toEqual(['1', '2', '3', '4'])
    const token = compileCategory({
      id: 'rtus',
      label: 'RTUs',
      noun: 'RTU',
      idShape: 'token',
      lint: true,
      complete: true,
    })
    expect(
      factIds(extractFacilityFacts(['Telemetry from RTU-07 and RTU 8.'], [token]), 'rtus'),
    ).toEqual(['RTU 8', 'RTU-07'])
    expect(singular('Spillway gates')).toBe('spillway gate')
    expect(singular('Depots / yards / transit centers')).toBe('depot / yard / transit center')
    expect(singular('RTUs / PLCs')).toBe('RTU / PLC')
  })
})

describe('domain context and prompt variables', () => {
  it('settles the threat family at scenario creation from the idea or the request', () => {
    const transit = builtinProfile('transit')
    expect(
      briefWithThreat(brief('Someone is feeding fake positions into the CAD/AVL system'), transit)
        .threatFamily,
    ).toBe('cyber_physical')
    expect(briefWithThreat(brief('A drone over the Northside Depot'), transit).threatFamily).toBe(
      'uas_drone',
    )
    expect(briefWithThreat(brief(''), transit).threatFamily).toBe('cyber_physical')
    expect(
      briefWithThreat({ ...brief('drone'), threatFamily: 'insider' }, transit).threatFamily,
    ).toBe('insider')
    const idea: ScenarioIdea = {
      id: 'i1',
      title: 'Lights Out',
      hook: 'Traction power substations trip one by one.',
      threat:
        'An attacker on the integrator VPN changed breaker setpoints in the traction power SCADA HMI.',
      systemsAffected: ['traction power SCADA'],
      sectionsExercised: [],
      difficulty: 'intermediate',
      whyItTeaches: '',
      suggestedRoles: [],
    }
    expect(briefWithThreat(brief(''), transit, idea).threatFamily).toBe('cyber_physical')
    expect(
      briefWithThreat(brief(''), transit, { ...idea, threatFamily: 'cyber' }).threatFamily,
    ).toBe('cyber')
  })

  it('gives prompts the profile and the family without code-only fields', () => {
    const ctx = domainContext(
      { orgType: 'water_dam' },
      { brief: { ...brief(''), threatFamily: 'uas_drone' } },
    )
    const d = domainVars(ctx.profile)
    expect(d.id).toBe('water_dam')
    expect(d.factCategories).toContain('Spillway gates')
    expect(d.injectTypes).toContain('scada_hmi')
    expect(d.injectTypes).not.toContain('fids_board')
    expect(d).not.toHaveProperty('rolePatterns')
    const t = threatVars(ctx.threat)
    expect(t.phaseArc.map((p) => p.number)).toEqual([1, 2, 3, 4])
    expect(t.decisionMustMention).toMatch(/law enforcement/)
    expect(t.technicalClue).toBe(false)
  })

  it('role heuristics include the profile words', () => {
    const h = roleHeuristics(builtinProfile('airport'))
    expect(h.security.test('asc Airport Security Coordinator')).toBe(true)
    expect(roleHeuristics().security.test('asc')).toBe(false)
    expect(
      roleHeuristics(builtinProfile('transit')).security.test('tpd Chief of Transit Police'),
    ).toBe(true)
    expect(h.public.test('pio Public Information Officer')).toBe(true)
    expect(h.technical.test('it IT Director')).toBe(true)
  })
})

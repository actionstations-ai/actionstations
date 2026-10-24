import { describe, expect, it } from 'vitest'
import {
  builtinProfile,
  bundledDomainIds,
  domainKey,
  bundledProfiles,
  chooseThreatFamily,
  DomainProfile,
  inferThreatFamily,
  isThreatFamilyId,
  resolveProfile,
  resolveThreat,
  THREAT_FAMILIES,
  THREAT_FAMILY_IDS,
  threatFamily,
} from './index'
import { ORG_TYPE_IDS } from '../schemas/project'
import { INJECT_TYPE_IDS, injectTypeInfo, injectTypesForDomain } from '../taxonomy'

// The bundled profiles (packs/domains/*.json, ADR-0020) as tests/setup registers them.
const DOMAIN_PROFILES = bundledProfiles()

describe('built-in domain profiles', () => {
  it('ships the profiles the brief asks for, each valid against the schema', () => {
    expect(bundledDomainIds()).toEqual([
      'airport',
      'transit',
      'water_dam',
      'water_utility',
      'energy_utility',
      'healthcare',
      'campus',
      'stadium_venue',
      'port_maritime',
      'municipal',
      'industrial',
      'unmanned_systems',
      'freight_rail',
      'gas_pipeline',
      'chemical',
      'public_health',
      'emergency_communications',
      'elections',
      'k12_schools',
      'commercial_facilities',
      'food_agriculture',
      'telecom',
      'data_center_it',
      'financial_services',
      'generic',
    ])
    for (const p of DOMAIN_PROFILES) expect(() => DomainProfile.parse(p)).not.toThrow()
    // Every orgType the project schema enumerates resolves to a profile of the same id.
    for (const id of ORG_TYPE_IDS) expect(builtinProfile(id).id).toBe(id)
  })

  it('references only inject types and threat families that exist', () => {
    for (const p of DOMAIN_PROFILES) {
      for (const t of p.injectTypes) expect(INJECT_TYPE_IDS, `${p.id} → ${t}`).toContain(t)
      for (const f of p.threatFamilies) expect(THREAT_FAMILY_IDS).toContain(f)
      expect(p.roles.length).toBeGreaterThanOrEqual(4)
      expect(p.roles.some((r) => /public|communications|affairs|relations|pio/i.test(r.name))).toBe(
        true,
      )
      expect(p.sceneAnchors.public).not.toMatch(/\bno\b|without/i)
      expect(p.sceneAnchors.control).not.toMatch(/\bno\b|without/i)
      expect(p.sceneAnchors.exterior).not.toMatch(/\bno\b|without/i)
      for (const c of p.factCategories) expect(c.noun || c.pattern, `${p.id}.${c.id}`).toBeTruthy()
    }
    // A profile never prefers a type tagged for another domain.
    for (const p of DOMAIN_PROFILES) {
      const allowed = new Set(injectTypesForDomain(p.id).map((t) => t.id))
      const foreign = p.injectTypes.filter((t) => !allowed.has(t))
      expect(foreign, `${p.id} prefers ${foreign.join(', ')}`).toEqual([])
    }
  })

  it('gives every bundled profile its own id and aliases (#322)', () => {
    const owner = new Map<string, string>()
    for (const p of DOMAIN_PROFILES)
      for (const key of new Set([p.id, ...p.aliases.map(domainKey)])) {
        expect(owner.get(key), `"${key}" of ${p.id}`).toBeUndefined()
        owner.set(key, p.id)
      }
  })

  it('resolves the sector aliases and the moved water and school aliases (#322)', () => {
    expect(builtinProfile('water').id).toBe('water_utility')
    expect(builtinProfile('water_utility').id).toBe('water_utility')
    expect(builtinProfile('dam').id).toBe('water_dam')
    expect(builtinProfile('school').id).toBe('k12_schools')
    expect(builtinProfile('School District').id).toBe('k12_schools')
    expect(builtinProfile('K-12').id).toBe('k12_schools')
    expect(builtinProfile('university').id).toBe('campus')
    expect(builtinProfile('casino').id).toBe('commercial_facilities')
    expect(builtinProfile('hotel').id).toBe('commercial_facilities')
    expect(builtinProfile('grain elevator').id).toBe('food_agriculture')
    expect(builtinProfile('ISP').id).toBe('telecom')
    expect(builtinProfile('colocation').id).toBe('data_center_it')
    expect(builtinProfile('MSP').id).toBe('data_center_it')
    expect(builtinProfile('credit union').id).toBe('financial_services')
    expect(builtinProfile('bank').id).toBe('financial_services')
  })

  it('resolves legacy orgType values and aliases, and falls back to generic', () => {
    expect(builtinProfile('hospital').id).toBe('healthcare')
    expect(builtinProfile('utility').id).toBe('energy_utility')
    expect(builtinProfile('Bus').id).toBe('transit')
    expect(builtinProfile('water-dam').id).toBe('water_dam')
    expect(builtinProfile('drone program').id).toBe('unmanned_systems')
    expect(builtinProfile('gas').id).toBe('gas_pipeline')
    expect(builtinProfile('chemical').id).toBe('chemical')
    expect(builtinProfile('chemical plant').id).toBe('chemical')
    expect(builtinProfile('Short Line').id).toBe('freight_rail')
    expect(builtinProfile('Health Department').id).toBe('public_health')
    expect(builtinProfile('9-1-1').id).toBe('emergency_communications')
    expect(builtinProfile('PSAP').id).toBe('emergency_communications')
    expect(builtinProfile('board of elections').id).toBe('elections')
    expect(builtinProfile('zoo').id).toBe('generic')
    expect(builtinProfile(undefined).id).toBe('generic')
  })

  it('applies project overrides field by field and keeps the built-in id', () => {
    const p = resolveProfile('transit', {
      label: 'Riverbend Transit',
      noiseExamples: ['a vending machine at the transit center'],
    })
    expect(p.id).toBe('transit')
    expect(p.label).toBe('Riverbend Transit')
    expect(p.noiseExamples).toEqual(['a vending machine at the transit center'])
    expect(p.roles).toEqual(builtinProfile('transit').roles)
    expect(resolveProfile('transit', undefined)).toEqual(builtinProfile('transit'))
  })

  it('tags airport-only inject types so other domains do not get them', () => {
    expect(injectTypeInfo('fids_board')?.domains).toEqual(['airport'])
    expect(injectTypeInfo('bhs_scada_screen')?.domains).toEqual(['airport'])
    const transitTypes = injectTypesForDomain('transit').map((t) => t.id)
    expect(transitTypes).not.toContain('fids_board')
    expect(transitTypes).toContain('info_display_board')
    expect(transitTypes).toContain('avl_fleet_map')
    expect(injectTypesForDomain('airport').map((t) => t.id)).toContain('fids_board')
  })
})

describe('threat families', () => {
  it('ships the eight families, each with a four-phase arc and lint rules', () => {
    expect(THREAT_FAMILY_IDS).toEqual([
      'cyber',
      'physical_security',
      'cyber_physical',
      'uas_drone',
      'insider',
      'natural_hazard',
      'infrastructure_failure',
      'mass_gathering',
    ])
    for (const t of THREAT_FAMILIES) {
      expect(t.phaseArc).toHaveLength(4)
      for (const p of t.phaseArc) expect(p.beats.length).toBeGreaterThanOrEqual(3)
      expect(t.decisionPointExamples.length).toBeGreaterThanOrEqual(2)
      expect(t.keywords.length).toBeGreaterThanOrEqual(5)
    }
    expect(threatFamily('cyber').lint).toEqual({ clueRequired: true, clueRole: 'technical' })
    expect(threatFamily('uas_drone').lint.clueRequired).toBe(false)
    expect(threatFamily('uas_drone').lint.decisionMustMention?.pattern).toMatch(/airspace/)
    expect(threatFamily('uas_drone').phaseArc[2]!.title).not.toMatch(/manual mode/i)
    expect(isThreatFamilyId('cyber')).toBe(true)
    expect(isThreatFamilyId('alien')).toBe(false)
  })

  it('infers the family from a brief or idea text, within the profile', () => {
    const all = THREAT_FAMILY_IDS
    expect(inferThreatFamily('A drone is loitering over the spillway', all, 'cyber')).toBe(
      'uas_drone',
    )
    expect(
      inferThreatFamily('Ransomware on the dispatch servers; phishing email', all, 'cyber'),
    ).toBe('cyber')
    expect(
      inferThreatFamily('The SCADA HMI setpoint changed without an operator', all, 'cyber'),
    ).toBe('cyber_physical')
    expect(inferThreatFamily('Flash flood warning and the spillway gates', all, 'cyber')).toBe(
      'natural_hazard',
    )
    expect(inferThreatFamily('A cut fence and an intruder in the powerhouse', all, 'cyber')).toBe(
      'physical_security',
    )
    expect(inferThreatFamily('Nothing in particular', all, 'cyber')).toBe('cyber')
    // A profile that does not list a family never gets it.
    const dam = builtinProfile('water_dam')
    expect(chooseThreatFamily(dam, 'A crowd crush at the concert')).toBe('cyber_physical')
    expect(
      chooseThreatFamily(builtinProfile('stadium_venue'), 'A crowd crush at the concert'),
    ).toBe('mass_gathering')
  })

  it('resolves a scenario threat from the brief, else the profile default', () => {
    const transit = builtinProfile('transit')
    expect(resolveThreat(transit, 'uas_drone').id).toBe('uas_drone')
    expect(resolveThreat(transit, undefined).id).toBe('cyber_physical')
    expect(resolveThreat(builtinProfile('airport'), 'nonsense').id).toBe('cyber')
  })
})

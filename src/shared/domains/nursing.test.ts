// The nursing domain (spec 0452 FR-1, FR-2): a profile built on the healthcare profile, three
// variants as role sets, and the scenario families for unit-level exercises and case studies.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ToolkitSchema } from '../toolkits'
import {
  builtinProfile,
  bundledProfiles,
  chooseThreatFamily,
  profileThreatFamilies,
  resolveThreat,
} from './index'

const nursing = () => bundledProfiles().find((p) => p.id === 'nursing')!
const healthcare = () => bundledProfiles().find((p) => p.id === 'healthcare')!

const FAMILY_IDS = [
  'unit_surge',
  'unit_evacuation',
  'unit_outbreak',
  'medication_error',
  'staffing_crisis',
  'unit_active_threat',
  'downtime_care',
  'ltc_heat_power_loss',
  'clinical_event',
]

describe('nursing domain profile', () => {
  it('inherits the healthcare outside parties, media and systems it builds on', () => {
    // The profile format has no `extends` field, so what a hospital exercise needs is repeated
    // in the nursing profile. This test is what keeps the two from drifting apart.
    const base = healthcare()
    const lowerParties = nursing().outsideParties.map((p) => p.toLowerCase())
    for (const party of [
      'CMS and the state department of health',
      'the Joint Commission',
      'local EMS and the regional trauma system',
      'neighboring hospitals (diversion and transfer)',
    ])
      expect(lowerParties, party).toContain(party.toLowerCase())
    expect(nursing().outsideParties.length).toBeGreaterThanOrEqual(base.outsideParties.length - 6)
    expect(nursing().systems.ot).toContain('medical gas and suction')
    expect(nursing().regulations).toEqual(['hipaa_breach'])
  })

  it('carries the unit-level roles of all three variants', () => {
    const teams = new Set(nursing().roles.map((r) => r.team.split(':')[0]))
    expect([...teams].sort()).toEqual(['Hospital unit', 'Long-term care', 'Simulation lab'])
    const keys = nursing().roles.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of ['charge_nurse', 'rrt_nurse', 'ltc_director_nursing', 'lab_instructor'])
      expect(keys).toContain(key)
  })

  it('resolves the dossier aliases to nursing and leaves hospital on healthcare', () => {
    for (const alias of ['charge nurse', 'RRT', 'nursing school', 'simulation lab', 'nursing home'])
      expect(builtinProfile(alias).id, alias).toBe('nursing')
    expect(builtinProfile('hospital').id).toBe('healthcare')
  })

  it('suggests the clinical care toolkit', () => {
    expect(nursing().suggestedToolkits).toEqual(['clinical_care'])
  })
})

describe('nursing threat families', () => {
  it('adds the nine families, none of them a built-in id', () => {
    const added = nursing().addedThreatFamilies!.map((f) => f.id)
    expect(added).toEqual(FAMILY_IDS)
  })

  it('lists them first, with the unit surge as the default', () => {
    const ids = profileThreatFamilies(nursing()).map((f) => f.id)
    expect(ids.slice(0, FAMILY_IDS.length)).toEqual(FAMILY_IDS)
    expect(resolveThreat(nursing(), undefined).id).toBe('unit_surge')
  })

  it('gives each family an arc, decisions and a purpose mix', () => {
    for (const family of nursing().addedThreatFamilies!) {
      expect(family.phaseArc.length, family.id).toBeGreaterThanOrEqual(4)
      for (const phase of family.phaseArc) expect(phase.beats.length).toBeGreaterThanOrEqual(3)
      expect(family.decisionPointExamples.length).toBeGreaterThanOrEqual(2)
      expect(Object.keys(family.purposeMix ?? {}).length).toBeGreaterThan(3)
      expect(family.promptGuidance).toBeTruthy()
    }
  })

  it('follows the dossier arcs for surge and for an unfolding case study', () => {
    const arc = (id: string) =>
      nursing()
        .addedThreatFamilies!.find((f) => f.id === id)!
        .phaseArc.map((p) => p.title)
    expect(arc('unit_surge')).toEqual([
      'Notification',
      'Unit readiness',
      'Arrivals and triage',
      'Sustained care',
      'Decompression and recovery',
    ])
    expect(arc('clinical_event')).toHaveLength(6)
    expect(arc('clinical_event')[0]).toBe('Presentation')
    expect(arc('clinical_event').at(-1)).toBe('Handoff and debrief')
  })

  it('infers the family from the words of a brief', () => {
    const p = nursing()
    expect(chooseThreatFamily(p, 'A deteriorating patient and a rapid response call')).toBe(
      'clinical_event',
    )
    expect(chooseThreatFamily(p, 'C. diff outbreak, cohorting and contact precautions')).toBe(
      'unit_outbreak',
    )
    expect(chooseThreatFamily(p, 'Heat wave, generator failure and a nursing home')).toBe(
      'ltc_heat_power_loss',
    )
    expect(chooseThreatFamily(p, 'Vertical evacuation of the NICU in a hurricane')).toBe(
      'unit_evacuation',
    )
    expect(chooseThreatFamily(p, 'A wrong dose and the disclosure conversation')).toBe(
      'medication_error',
    )
  })
})

describe('clinical care toolkit', () => {
  const toolkit = () =>
    ToolkitSchema.parse(
      JSON.parse(readFileSync(resolve('packs/toolkits/clinical_care.json'), 'utf8')),
    )

  it('parses and offers the nine structured decisions of FR-12', () => {
    expect(toolkit().decisionForms.map((d) => d.id)).toEqual([
      'assign_nurse',
      'call_rapid_response',
      'escalate_staffing_shortage',
      'set_evacuation_order',
      'triage_arrival',
      'isolate_or_cohort',
      'request_transfer',
      'disclose_event',
      'notify',
    ])
  })

  it('carries the clinical judgment steps and the SBAR elements as knowledge', () => {
    const text = JSON.stringify(toolkit().knowledge)
    for (const step of [
      'recognize cues',
      'analyze cues',
      'prioritize hypotheses',
      'generate solutions',
      'take action',
      'evaluate outcomes',
    ])
      expect(text).toContain(step)
    expect(text).toContain('Situation, Background, Assessment, Recommendation')
  })

  it('is proposed for the nursing domain and for the domains that reuse it', () => {
    const domains = toolkit().appliesTo.domains
    for (const d of ['nursing', 'healthcare', 'public_health', 'k12_schools', 'stadium_venue'])
      expect(domains).toContain(d)
  })
})

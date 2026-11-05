// The EMS, fire and hazmat pack (spec 0456): the domain profile, its added threat families and
// the toolkits it ships stay valid and inside the prompt caps.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile, mergeThreatFamilies } from '../domains'
import { ToolkitSchema, toolkitKnowledge, suggestToolkits } from './index'

const readJson = (rel: string): unknown => JSON.parse(readFileSync(resolve(rel), 'utf8'))
const TOOLKIT_IDS = ['mci_triage'] as const

describe('ems_fire domain profile', () => {
  const profile = DomainProfile.parse(readJson('packs/domains/ems_fire.json'))

  it('adds five families and lists them first', () => {
    const added = (profile.addedThreatFamilies ?? []).map((f) => f.id)
    expect(added).toEqual([
      'mass_casualty_incident',
      'hazmat_response',
      'structure_fire_command',
      'technical_rescue',
      'response_degradation',
    ])
    expect(profile.threatFamilies.slice(0, 5)).toEqual(added)
    expect(() =>
      mergeThreatFamilies(
        new Map([['d', [{ packId: 'ems', families: profile.addedThreatFamilies ?? [] }]]]),
      ),
    ).not.toThrow()
  })

  it('has the roster teams the spec names and suggests the three toolkits', () => {
    const teams = new Set(profile.roles.map((r) => r.team))
    for (const t of [
      'Command',
      'Medical',
      'Fire and rescue',
      'Hazmat',
      'Dispatch',
      'Healthcare coalition',
    ])
      expect(teams).toContain(t)
    for (const id of ['mci_triage', 'hazmat', 'dispatch', 'media_environment'])
      expect(profile.suggestedToolkits).toContain(id)
  })
})

describe.each(TOOLKIT_IDS)('toolkit %s', (id) => {
  const toolkit = ToolkitSchema.parse(readJson(`packs/toolkits/${id}.json`))

  it('keeps all its knowledge inside the per-toolkit prompt cap', () => {
    const { truncated, text } = toolkitKnowledge([toolkit])
    expect(truncated).toEqual([])
    expect(text).toContain('Realism rules')
  })

  it('ships a template folder for every inject type it adds', () => {
    for (const type of toolkit.injectTypes)
      expect(() => readFileSync(resolve(`templates/injects/${type}/meta.json`))).not.toThrow()
  })

  it('has unique decision form ids', () => {
    const ids = toolkit.decisionForms.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('mci_triage', () => {
  const toolkit = ToolkitSchema.parse(readJson('packs/toolkits/mci_triage.json'))

  it('is proposed for a bus crash brief and for the ems_fire domain', () => {
    const hits = suggestToolkits({
      available: [toolkit],
      active: [],
      text: 'A school bus crash leaves many patients and triage is overwhelmed.',
      domainId: 'municipal',
    })
    expect(hits.map((h) => h.toolkitId)).toContain('mci_triage')
  })

  it('states that the exercise does not pick a triage method', () => {
    expect(toolkit.knowledge.realismRules.join(' ')).toMatch(/START, SALT or the local method/)
  })
})

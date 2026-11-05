// The EMS, fire and hazmat pack (spec 0456): the domain profile, its added threat families and
// the toolkits it ships stay valid and inside the prompt caps.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile, mergeThreatFamilies } from '../domains'
import { ToolkitSchema, toolkitKnowledge, suggestToolkits } from './index'

const readJson = (rel: string): unknown => JSON.parse(readFileSync(resolve(rel), 'utf8'))
const TOOLKIT_IDS = ['mci_triage', 'hazmat', 'dispatch'] as const

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

describe('structured decisions (spec 0456 FR-10)', () => {
  const forms = TOOLKIT_IDS.flatMap(
    (id) => ToolkitSchema.parse(readJson(`packs/toolkits/${id}.json`)).decisionForms,
  )
  it('cover declare an MCI, triage method, destination, hospital status, mutual aid, protective actions, PPE and entry, command transfer, mayday and public statement', () => {
    expect(forms.map((f) => f.id).sort()).toEqual(
      [
        'assign_patient_destination',
        'declare_mayday',
        'declare_mci',
        'issue_public_statement',
        'request_mutual_aid',
        'set_hospital_status',
        'set_ppe_and_entry',
        'set_protective_actions',
        'set_triage_method',
        'transfer_command',
      ].sort(),
    )
  })
  it('asks for a time on every decision and an area for protective actions', () => {
    for (const f of forms)
      expect(
        f.fields.some((x) => x.kind === 'time'),
        f.id,
      ).toBe(true)
    const pa = forms.find((f) => f.id === 'set_protective_actions')!
    expect(pa.fields.some((x) => x.kind === 'area')).toBe(true)
  })
  it('records the from, to, time and briefing of a command transfer', () => {
    const t = forms.find((f) => f.id === 'transfer_command')!
    expect(t.fields.map((x) => x.id)).toEqual(
      expect.arrayContaining(['from', 'to', 'time', 'briefing']),
    )
  })
})

describe('hazmat toolkit and the Emergency Response Guidebook', () => {
  const toolkit = ToolkitSchema.parse(readJson('packs/toolkits/hazmat.json'))

  it('ships no guidebook content and says where distances come from', () => {
    const all = JSON.stringify(toolkit)
    expect(toolkit.knowledge.realismRules.join(' ')).toMatch(
      /Never ship or invent Emergency Response Guidebook/,
    )
    expect(all).not.toMatch(/Table 1|Table 3|large spill/i)
    const form = toolkit.decisionForms.find((f) => f.id === 'set_protective_actions')
    expect(form?.fields.find((f) => f.id === 'distance_source')?.required).toBe(true)
  })

  it('shows no real UN number with distances in any bundled preview', () => {
    for (const type of ['protective_action_order', 'protective_action_recommendation']) {
      const preview = readFileSync(resolve(`templates/injects/${type}/preview.json`), 'utf8')
      expect(preview).not.toMatch(/UN ?\d{4}/)
      expect(preview).toMatch(/invented|fictional/i)
    }
  })
})

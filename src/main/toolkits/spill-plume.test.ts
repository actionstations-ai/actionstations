// The environmental response domain and the spill and plume toolkit (spec 0455, #757, #759):
// the bundled files parse with the app's schemas, the toolkit's knowledge fits the prompt
// caps, every product the toolkit names has a template whose sample data validates, and the
// domain's threat families register next to the built-in ones.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { DomainProfile, THREAT_FAMILY_IDS } from '@shared/domains/schema'
import { mergeThreatFamilies } from '@shared/domains/threat-registry'
import { ToolkitSchema, suggestToolkits, toolkitKnowledge } from '@shared/toolkits'
import { TemplateMeta, TemplatePreview } from '../render/templates'

const root = process.cwd()
const readJson = (...parts: string[]): unknown =>
  JSON.parse(readFileSync(join(root, ...parts), 'utf8'))

const toolkit = ToolkitSchema.parse(readJson('packs', 'toolkits', 'spill_plume.json'))
const domain = DomainProfile.parse(readJson('packs', 'domains', 'environmental_response.json'))

describe('spill_plume toolkit', () => {
  it('is named by its file and carries the field vocabulary', () => {
    expect(toolkit.id).toBe('spill_plume')
    expect(toolkit.knowledge.glossary.map((g) => g.term)).toEqual(
      expect.arrayContaining(['QI', 'FOSC', 'WCD', 'NRC']),
    )
  })

  it('fits its knowledge in the per-toolkit prompt cap with nothing cut', () => {
    const text = toolkitKnowledge([toolkit])
    expect(text.truncated).toEqual([])
    expect(text.text).toContain('Only the FOSC approves dispersant')
    expect(text.text).toContain('The responsible party calls the NRC')
  })

  it('is proposed for an oil spill brief and for the domains it suits', () => {
    const base = { available: [toolkit], active: [], domainId: 'generic' }
    const hit = suggestToolkits({ ...base, text: 'A worst case discharge reaches the marsh.' })
    expect(hit[0]).toMatchObject({ toolkitId: 'spill_plume' })
    expect(hit[0]?.reason).toContain('worst case discharge')
    expect(suggestToolkits({ ...base, text: 'A coffee spill in the lobby.' })).toEqual([])
    for (const id of ['port_maritime', 'chemical', 'industrial', 'environmental_response']) {
      expect(suggestToolkits({ ...base, text: 'x', domainId: id }).map((s) => s.toolkitId)).toEqual(
        ['spill_plume'],
      )
    }
  })

  it('is on the suggested list of the domains it extends', () => {
    for (const id of ['port_maritime', 'chemical', 'industrial']) {
      const d = DomainProfile.parse(readJson('packs', 'domains', `${id}.json`))
      expect(d.suggestedToolkits).toContain('spill_plume')
    }
  })
})

describe('spill_plume products', () => {
  const ajv = new Ajv({ strict: false })

  it.each(toolkit.injectTypes)('%s is a template with a taxonomy block and valid samples', (id) => {
    const dir = join(root, 'templates', 'injects', id)
    expect(existsSync(join(dir, 'template.html'))).toBe(true)
    const meta = TemplateMeta.parse(readJson('templates', 'injects', id, 'meta.json'))
    expect(meta.type).toBe(id)
    expect(meta.taxonomy).toBeDefined()
    expect(meta.paper).toBe(true)
    const preview = TemplatePreview.parse(readJson('templates', 'injects', id, 'preview.json'))
    const validate = ajv.compile(readJson('templates', 'injects', id, 'schema.json') as object)
    expect(validate(preview.fields), JSON.stringify(validate.errors)).toBe(true)
  })

  it('names the ICS forms and the NRC record the spec lists', () => {
    expect(toolkit.injectTypes).toEqual(
      expect.arrayContaining([
        'ics_232_resources_at_risk',
        'ics_233_open_action_tracker',
        'ics_234_work_analysis_matrix',
        'ics_202_incident_objectives',
        'ics_204_assignment_list',
        'countermeasure_request',
        'closure_order',
        'claims_line_notice',
        'nrc_report_record',
      ]),
    )
  })
})

describe('environmental_response domain', () => {
  it('accepts both incident and spill management team names', () => {
    expect(domain.aliases).toEqual(
      expect.arrayContaining(['imt', 'smt', 'incident_management_team']),
    )
    expect(domain.label).toBeTruthy()
  })

  it('adds the spill families without redefining a built-in one', () => {
    const added = domain.addedThreatFamilies ?? []
    expect(added.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        'vessel_cargo_release',
        'tank_facility_release',
        'pipeline_river_release',
        'offshore_well_release',
        'spill_toxic_plume',
        'marine_firefight_salvage',
        'water_intake_threat',
        'wildlife_shoreline_impact',
      ]),
    )
    const merged = mergeThreatFamilies(
      new Map([
        ['domains', [{ packId: 'ai.actionstations.environmental-response', families: added }]],
      ]),
    )
    for (const id of domain.threatFamilies) expect(merged.byId.has(id)).toBe(true)
    expect(domain.threatFamilies).toContain('infrastructure_failure')
    expect(THREAT_FAMILY_IDS).toContain('infrastructure_failure')
  })

  it('gives every family a four-phase arc that runs from notification to demobilization', () => {
    for (const f of domain.addedThreatFamilies ?? []) {
      expect(f.phaseArc).toHaveLength(4)
      expect(f.phaseArc[0]?.title).toBe('Discovery and Notification')
      expect(f.phaseArc[3]?.title).toBe('Recovery and Demobilization')
      expect(f.decisionPointExamples.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('offers the toolkit products, the toolkit itself, and the incident command roles', () => {
    expect(domain.suggestedToolkits).toEqual(['spill_plume'])
    // The products arrive through the toolkit, not the profile's own list.
    for (const id of toolkit.injectTypes) expect(domain.injectTypes).not.toContain(id)
    const abbreviations = domain.roles.map((r) => r.abbreviation)
    expect(abbreviations).toEqual(
      expect.arrayContaining(['QI', 'FOSC', 'ENVL', 'SSC', 'PIO', 'OSRO']),
    )
    expect(new Set(domain.roles.map((r) => r.key)).size).toBe(domain.roles.length)
  })
})

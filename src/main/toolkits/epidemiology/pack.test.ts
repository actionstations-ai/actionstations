// The bundled epidemiology toolkit pack (#834): the toolkit parses, its knowledge fits the
// prompt cap uncut, its templates exist and their previews validate against their schemas.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import {
  fieldTaskGroups,
  tagCapabilityRows,
  tagObjectiveDrafts,
  toolkitKnowledge,
  ToolkitSchema,
} from '@shared/toolkits'
import { TemplateMeta } from '../../render/templates'
import { runMetric } from '../../evaluation/metrics/registry'
import { registerEpidemiologyMetrics } from './register'
import { EPI_LINT_RULES } from './lint'

const ROOT = join(__dirname, '../../../..')
const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(join(ROOT, 'packs/toolkits/epidemiology.json'), 'utf8')),
)

const OWN_TEMPLATES = [
  'case_report_form',
  'clinician_health_alert',
  'exposure_notice',
  'hotline_call_notes',
  'isolation_quarantine_guidance',
  'outbreak_questionnaire',
  'school_employer_letter',
]

describe('epidemiology toolkit file', () => {
  it('has the stable id other fields reuse', () => {
    expect(toolkit.id).toBe('epidemiology')
  })

  it('fits the knowledge cap without cutting a line', () => {
    const out = toolkitKnowledge([toolkit])
    expect(out.truncated).toEqual([])
    expect(out.text).toContain('Never order a curve by report date')
  })

  it('names the lint rules the app ships', () => {
    expect(toolkit.lintRules.sort()).toEqual([...EPI_LINT_RULES].sort())
  })

  it('covers every decision the spec lists with a form', () => {
    expect(toolkit.decisionForms.map((f) => f.id)).toEqual([
      'adopt_case_definition',
      'declare_outbreak',
      'request_epi_aid',
      'classify_contact',
      'issue_exposure_notice',
      'recommend_exclusion_or_closure',
      'order_lab_priority',
      'open_dispensing_site',
      'release_data',
      'record_contact_outcome',
      'record_dispensing_count',
      'submit_epi_curve',
    ])
  })

  it('names metrics the app runs, with configs that validate', () => {
    registerEpidemiologyMetrics()
    expect(toolkit.metrics.length).toBeGreaterThanOrEqual(8)
    for (const m of toolkit.metrics) {
      const result = runMetric({ id: m.id, config: m.config }, {})
      expect(result.metricId, m.label).toBe(m.id)
    }
  })

  it('carries a source with every pathogen fact', () => {
    const pathogens = [
      'Norovirus',
      'Salmonella',
      'Measles',
      'Influenza',
      'SARS-CoV-2',
      'Pertussis',
      'Legionella',
    ]
    for (const name of pathogens) {
      const g = toolkit.knowledge.glossary.find((x) => x.term.startsWith(name))
      expect(g?.definition, name).toMatch(/CDC/)
    }
  })
})

describe('epidemiology evaluation data (PHEP, April 2024)', () => {
  const tag = (id: string) => toolkit.exerciseTags.find((t) => t.id === id)!

  it('lists the exercises of the two tracks and the drill', () => {
    expect(toolkit.exerciseTags.map((t) => t.id)).toEqual([
      'phep_biological_incident_100',
      'phep_biological_incident_200',
      'phep_capstone_100',
      'phep_capstone_200',
      'phep_capstone_300',
      'phep_capstone_400',
      'phep_critical_contacts',
    ])
    for (const t of toolkit.exerciseTags) {
      expect(t.version).toBe('April 2024')
      expect(t.source).toMatch(/^https:\/\/www\.cdc\.gov\/.*Exercise-Framework/)
    }
  })

  it('carries the framework text: types, capabilities 8 and 9 for Biological 200, the 60 minute drill', () => {
    expect(tag('phep_biological_incident_100').type).toBe('discussion')
    expect(tag('phep_biological_incident_200').type).toBe('functional')
    expect(tag('phep_biological_incident_200').capabilities.join(' ')).toMatch(
      /Capability 8.*Capability 9/,
    )
    expect(tag('phep_capstone_400').type).toBe('full_scale')
    expect(tag('phep_critical_contacts').notes.join(' ')).toMatch(/60 minutes/)
    expect(tag('phep_critical_contacts').frequency).toBe('Each budget period')
    expect(tag('phep_biological_incident_100').frequency).toBe(
      'Once during the period of performance',
    )
  })

  it('sets the 90 day improvement plan window and the five program priorities on every exercise', () => {
    for (const t of toolkit.exerciseTags) {
      expect(t.improvementPlanDueDays, t.id).toBe(90)
      expect(t.priorities).toEqual([
        'Partnerships',
        'Health equity',
        'Risk communications',
        'Data modernization',
        'Recovery',
      ])
    }
  })

  it('maps the Core Capabilities the profile shows to PHEP capability numbers', () => {
    const phep = (core: string) =>
      toolkit.capabilities.find((c) => c.coreCapability === core)?.mappings[0]?.ids
    expect(phep('public_health_healthcare_and_emergency_medical_services')).toEqual([
      '8',
      '9',
      '11',
      '12',
      '13',
    ])
    expect(phep('situational_assessment')).toContain('13')
    expect(phep('public_information_and_warning')).toEqual(['4'])
    expect(phep('operational_coordination')).toEqual(['3'])
    for (const c of toolkit.capabilities) expect(c.criticalTasks.length).toBeGreaterThanOrEqual(3)
  })

  it('maps every PHEP capability a tag names to a Core Capability through the toolkit', () => {
    for (const t of toolkit.exerciseTags) {
      if (!t.capabilities.length) continue
      expect(t.capabilityFramework, t.id).toBe(toolkit.capabilities[0]!.mappings[0]!.framework)
      for (const row of tagCapabilityRows(t, [toolkit]))
        expect(row.coreCapabilities.length, `${t.id}: ${row.label}`).toBeGreaterThan(0)
    }
    const bi200 = tagCapabilityRows(tag('phep_biological_incident_200'), [toolkit])
    expect(bi200[0]!.coreCapabilities).toEqual([
      'public_health_healthcare_and_emergency_medical_services',
    ])
    const contacts = tagCapabilityRows(tag('phep_critical_contacts'), [toolkit])
    expect(contacts[0]!.coreCapabilities).toEqual([
      'public_health_healthcare_and_emergency_medical_services',
      'situational_assessment',
    ])
  })

  it('gives the evaluation guides its critical tasks for the four Core Capabilities', () => {
    const groups = fieldTaskGroups([toolkit])
    expect(groups.map((g) => g.capability)).toEqual([
      'public_health_healthcare_and_emergency_medical_services',
      'situational_assessment',
      'public_information_and_warning',
      'operational_coordination',
    ])
    expect(groups[0]!.tasks.join(' ')).toMatch(/case definition/)
    expect(groups[0]!.mappings).toBe('CDC PHEP capabilities (2018) 8, 9, 11, 12, 13')
  })

  it('names each suggested objective so the scenario can take it', () => {
    const drafts = tagObjectiveDrafts(tag('phep_biological_incident_200'))
    expect(drafts.map((d) => d.name)).toEqual(['Capability 8', 'Capability 9'])
    expect(drafts[0]!.text).toMatch(/^Determine MCM dispensing/)
  })
})

describe('epidemiology templates', () => {
  it.each(OWN_TEMPLATES)(
    '%s has a valid meta, a schema its preview satisfies and no AI media',
    (id) => {
      const dir = join(ROOT, 'templates/injects', id)
      for (const f of ['template.html', 'style.css', 'schema.json', 'preview.json', 'meta.json'])
        expect(existsSync(join(dir, f)), `${id}/${f}`).toBe(true)
      const meta = TemplateMeta.parse(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')))
      expect(meta.type).toBe(id)
      expect(meta.taxonomy).toBeDefined()
      expect(meta.taxonomy!.domains).toBeUndefined()
      const schema = JSON.parse(readFileSync(join(dir, 'schema.json'), 'utf8'))
      const preview = JSON.parse(readFileSync(join(dir, 'preview.json'), 'utf8'))
      const ajv = new Ajv2020({ strict: false, allErrors: true })
      const validate = ajv.compile(schema)
      expect(validate(preview.fields), JSON.stringify(validate.errors)).toBe(true)
      expect(toolkit.injectTypes).toContain(id)
    },
  )
})

describe('expert review facts (#847)', () => {
  it('counts an epidemiologically linked measles case as confirmed, as the CSTE definition does', () => {
    const measles = toolkit.knowledge!.glossary!.find((g) => g.term === 'Measles')!
    expect(measles.definition).toMatch(/Epi-linked to a lab-confirmed case: confirmed \(CSTE\)/)
    const preview = JSON.parse(
      readFileSync(join(ROOT, 'templates/injects/clinician_health_alert/preview.json'), 'utf8'),
    )
    expect(preview.fields.caseDefinition).toMatch(
      /^Confirmed: .*epidemiologic link to a laboratory-confirmed case\. Probable: .*no epidemiologic link/,
    )
  })
})

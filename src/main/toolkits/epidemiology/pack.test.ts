// The bundled epidemiology toolkit pack (#834): the toolkit parses, its knowledge fits the
// prompt cap uncut, its templates exist and their previews validate against their schemas.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { toolkitKnowledge, ToolkitSchema } from '@shared/toolkits'
import { TemplateMeta } from '../../render/templates'
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
    ])
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

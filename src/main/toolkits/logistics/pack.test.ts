// The bundled supply chain domain and logistics toolkit (#795): both parse, the knowledge fits
// the prompt cap uncut, the threat families have arcs, the decisions convert to live forms, and
// the domain, toolkit and media environment toolkit agree.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it, vi } from 'vitest'
import { TemplateMeta } from '../../render/templates'
import { LOGISTICS_LINT_RULES } from './lint'
import { toolkitKnowledge, ToolkitSchema } from '@shared/toolkits'
import { DomainProfile } from '@shared/domains/schema'
import { liveFormsOf } from '../decision-forms'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp', isPackaged: false } }))

const ROOT = join(__dirname, '../../../..')
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const toolkit = ToolkitSchema.parse(read('packs/toolkits/logistics.json'))
const domain = DomainProfile.parse(read('packs/domains/supply_chain.json'))

const OWN_TEMPLATES = [
  'supplier_status_board',
  'supply_disruption_notice',
  'temperature_excursion_alert',
  'customer_complaint_log',
  'product_recall_notice',
  'recall_consignee_letter',
  'recall_status_report',
  'fda_records_request_letter',
]

describe('logistics templates', () => {
  it.each(OWN_TEMPLATES)(
    '%s has a valid meta, a schema its preview satisfies and a golden',
    (id) => {
      const dir = join(ROOT, 'templates/injects', id)
      for (const f of ['template.html', 'style.css', 'schema.json', 'preview.json', 'meta.json'])
        expect(existsSync(join(dir, f)), `${id}/${f}`).toBe(true)
      const meta = TemplateMeta.parse(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')))
      expect(meta.type).toBe(id)
      expect(meta.taxonomy).toBeDefined()
      expect(existsSync(join(dir, '__golden__/default.png'))).toBe(true)
      const schema = JSON.parse(readFileSync(join(dir, 'schema.json'), 'utf8'))
      const preview = JSON.parse(readFileSync(join(dir, 'preview.json'), 'utf8'))
      const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema)
      expect(validate(preview.fields), JSON.stringify(validate.errors)).toBe(true)
      expect(toolkit.injectTypes).toContain(id)
    },
  )

  it('names the lint rules the app ships', () => {
    expect([...toolkit.lintRules].sort()).toEqual([...LOGISTICS_LINT_RULES].sort())
  })
})

describe('logistics toolkit file', () => {
  it('fits the knowledge cap without cutting a line', () => {
    const out = toolkitKnowledge([toolkit])
    expect(out.truncated).toEqual([])
    expect(out.text).toContain('Effectiveness check levels')
  })

  it('states the FSMA 204 date as a status, not as settled', () => {
    const rules = toolkit.knowledge.realismRules.join(' ')
    expect(rules).toMatch(/2028-07-20/)
  })

  it('has decision forms that convert to valid live forms', () => {
    const forms = liveFormsOf([toolkit])
    expect(forms.length).toBe(toolkit.decisionForms.length)
    for (const f of toolkit.decisionForms) expect(f.id.startsWith('logistics_')).toBe(true)
  })
})

describe('supply_chain domain', () => {
  it('adds five threat families with phase arcs and lists them first', () => {
    const added = (domain.addedThreatFamilies ?? []).map((f) => f.id)
    expect(added).toEqual([
      'supplier_failure',
      'lane_disruption',
      'product_recall',
      'logistics_provider_cyber',
      'critical_supply_shortage',
    ])
    expect(domain.threatFamilies.slice(0, 5)).toEqual(added)
    for (const f of domain.addedThreatFamilies ?? []) {
      expect(f.phaseArc.length).toBeGreaterThanOrEqual(5)
      for (const p of f.phaseArc) expect(p.beats.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('has the twelve roles the dossier names', () => {
    expect(domain.roles.map((r) => r.abbreviation)).toEqual([
      'CSCO',
      'PROC',
      'SRM',
      'LOG',
      'DC',
      'PLAN',
      'FSQA',
      'RECALL',
      'CS',
      'GC',
      'COMMS',
      'IT',
    ])
  })

  it('suggests the toolkit and the media environment toolkit, and they apply back', () => {
    expect(domain.suggestedToolkits).toContain('logistics')
    expect(domain.suggestedToolkits).toContain('media_environment')
    expect(toolkit.appliesTo.domains).toContain('supply_chain')
    const media = ToolkitSchema.parse(read('packs/toolkits/media_environment.json'))
    expect(media.appliesTo.domains).toContain('supply_chain')
  })

  it('is suggested the toolkit by the domains that reuse it', () => {
    for (const id of ['food_agriculture', 'port_maritime', 'freight_rail', 'healthcare']) {
      const d = DomainProfile.parse(read(`packs/domains/${id}.json`))
      expect(d.suggestedToolkits, id).toContain('logistics')
    }
  })
})

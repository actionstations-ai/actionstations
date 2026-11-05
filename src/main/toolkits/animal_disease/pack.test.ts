// The bundled animal disease toolkit pack (spec 0460, #852): the toolkit parses, its knowledge
// fits the prompt cap uncut, every template has a valid meta, a schema its previews satisfy and
// no AI media, and the lint rules fire on the products they read.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { toolkitKnowledge, ToolkitSchema } from '@shared/toolkits'
import { TemplateMeta } from '../../render/templates'
import { fieldLintIssues } from '../lint-rules'
import { ANIMAL_LINT_RULES } from './lint'

const ROOT = join(__dirname, '../../../..')
const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(join(ROOT, 'packs/toolkits/animal_disease.json'), 'utf8')),
)

const OWN_TEMPLATES = [
  'animal_consumer_faq',
  'animal_depop_plan',
  'animal_event_cancellation',
  'animal_health_quarantine_order',
  'animal_indemnity_worksheet',
  'animal_movement_permit',
  'animal_premises_investigation',
  'animal_presumptive_notice',
  'animal_producer_letter',
  'animal_worker_health_log',
]

describe('animal disease toolkit file', () => {
  it('has the stable id other fields reuse', () => {
    expect(toolkit.id).toBe('animal_disease')
  })

  it('fits the knowledge cap without cutting a line and tags the plan editions', () => {
    const out = toolkitKnowledge([toolkit])
    expect(out.truncated).toEqual([])
    expect(out.text).toContain('May 2017')
    expect(out.text).toContain('October 2020')
    expect(out.text).toContain('Only an at-risk premises can become monitored')
  })

  it('names exactly the lint rules the app ships', () => {
    expect([...toolkit.lintRules].sort()).toEqual([...ANIMAL_LINT_RULES].sort())
  })

  it('lists its own templates and the shared ones it reuses', () => {
    for (const id of OWN_TEMPLATES) expect(toolkit.injectTypes).toContain(id)
    for (const id of ['lab_result_report', 'sitrep', 'press_release'])
      expect(toolkit.injectTypes).toContain(id)
  })

  it('is proposed to the domains that reuse it', () => {
    expect(toolkit.appliesTo.domains).toEqual(
      expect.arrayContaining([
        'animal_health',
        'food_agriculture',
        'public_health',
        'municipal',
        'campus',
        'emergency_communications',
      ]),
    )
  })
})

describe('media environment rule', () => {
  it('lists the animal health domain', () => {
    const media = ToolkitSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'packs/toolkits/media_environment.json'), 'utf8')),
    )
    expect(media.appliesTo.domains).toContain('animal_health')
  })
})

describe('animal disease templates', () => {
  it.each(OWN_TEMPLATES)(
    '%s has a valid meta, a schema every preview satisfies and no AI media',
    (id) => {
      const dir = join(ROOT, 'templates/injects', id)
      for (const f of ['template.html', 'style.css', 'schema.json', 'preview.json', 'meta.json'])
        expect(existsSync(join(dir, f)), `${id}/${f}`).toBe(true)
      const meta = TemplateMeta.parse(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')))
      expect(meta.type).toBe(id)
      expect(meta.taxonomy).toBeDefined()
      expect(meta.imageSlots).toEqual([])
      expect(readFileSync(join(dir, 'template.html'), 'utf8')).not.toMatch(/<img|assets\./)
      const schema = JSON.parse(readFileSync(join(dir, 'schema.json'), 'utf8'))
      const preview = JSON.parse(readFileSync(join(dir, 'preview.json'), 'utf8'))
      const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema)
      expect(validate(preview.fields), JSON.stringify(validate.errors)).toBe(true)
      for (const v of meta.variants) {
        const merged = { ...preview.fields, ...(preview.variants?.[v]?.fields ?? {}) }
        expect(validate(merged), `${v}: ${JSON.stringify(validate.errors)}`).toBe(true)
      }
      expect(toolkit.injectTypes).toContain(id)
    },
  )

  it('gives the permit and the notice a golden for each variant', () => {
    for (const [id, variants] of [
      ['animal_movement_permit', ['request', 'decision']],
      ['animal_presumptive_notice', ['presumptive', 'confirmed']],
    ] as const)
      for (const v of variants)
        expect(
          existsSync(join(ROOT, 'templates/injects', id, '__golden__', `${v}.png`)),
          `${id}/${v}`,
        ).toBe(true)
  })
})

describe('animal disease lint rules on the shipped previews', () => {
  const preview = (id: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(ROOT, 'templates/injects', id, 'preview.json'), 'utf8')).fields

  it('accept every shipped preview', () => {
    for (const id of OWN_TEMPLATES) expect(fieldLintIssues(id, preview(id)), id).toEqual([])
  })

  it('flag a control area under the HPAI minimum', () => {
    const fields = preview('animal_health_quarantine_order')
    const zones = (fields.zones as Array<Record<string, unknown>>).map((z) =>
      z.kind === 'control area' ? { ...z, extentKm: 6 } : z,
    )
    const issues = fieldLintIssues('animal_health_quarantine_order', { ...fields, zones })
    expect(issues.map((i) => i.message).join(' ')).toMatch(/control area is 6 km/)
  })

  it('flag a monitored premises that was not at-risk', () => {
    const fields = {
      ...preview('animal_premises_investigation'),
      designation: 'monitored',
      previousDesignation: 'contact',
    }
    expect(fieldLintIssues('animal_premises_investigation', fields)[0]!.message).toMatch(
      /only an at-risk/,
    )
  })

  it('flag a depopulation plan past 24 hours with no reason', () => {
    const fields = { ...preview('animal_depop_plan'), targetCompleteAtIso: '2026-10-23T09:00:00Z' }
    expect(fieldLintIssues('animal_depop_plan', fields)[0]!.message).toMatch(
      /plan goal is 24 hours/,
    )
    expect(
      fieldLintIssues('animal_depop_plan', { ...fields, delayReason: 'Site closed overnight.' }),
    ).toEqual([])
  })

  it('flag an FMD sampling interval that differs from the table', () => {
    const fields = {
      ...preview('animal_premises_investigation'),
      plan: 'FMD Red Book (October 2020)',
      designation: 'at-risk',
      samplingIntervalDays: 14,
    }
    expect(fieldLintIssues('animal_premises_investigation', fields)[0]!.message).toMatch(
      /every 10 days/,
    )
  })

  it('flag a presumptive notice from the reference laboratory', () => {
    const fields = {
      ...preview('animal_presumptive_notice'),
      laboratory: 'National Veterinary Services Laboratories',
    }
    expect(fieldLintIssues('animal_presumptive_notice', fields)[0]!.message).toMatch(
      /network laboratory/,
    )
  })

  it('report nothing when the structured field is absent', () => {
    expect(fieldLintIssues('animal_health_quarantine_order', { orderNumber: 'x' })).toEqual([])
    expect(fieldLintIssues('animal_depop_plan', { planNumber: 'x' })).toEqual([])
  })
})

// The structures toolkit and the OSHA reporting regulation (spec 0471, #828): the bundled files
// parse with the app's schemas, the knowledge fits the prompt cap, every product has a template
// whose sample data validates and passes the toolkit's own format rules.
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Ajv from 'ajv/dist/2020.js'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

import { DomainProfile } from '@shared/domains/schema'
import { Regulation } from '@shared/schemas/compliance'
import { suggestToolkits, toolkitKnowledge, ToolkitSchema } from '@shared/toolkits'
import { TemplateMeta, TemplatePreview } from '../../render/templates'

const { fieldLintIssues } = await import('../lint-rules')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { registerStructuresToolkit } = await import('./register')

registerStructuresToolkit()

const root = process.cwd()
const readJson = (...parts: string[]): unknown =>
  JSON.parse(readFileSync(join(root, ...parts), 'utf8'))

const toolkit = ToolkitSchema.parse(readJson('packs', 'toolkits', 'structures.json'))
const domain = DomainProfile.parse(readJson('packs', 'domains', 'construction.json'))
/** The placard template belongs to the earthquake toolkit; this toolkit offers it by id. */
const OWN = toolkit.injectTypes.filter((t) => t !== 'building_placard')

describe('structures toolkit', () => {
  it('is named by its file and carries the field vocabulary', () => {
    expect(toolkit.id).toBe('structures')
    expect(toolkit.knowledge.glossary.map((g) => g.term)).toEqual(
      expect.arrayContaining(['Competent person', 'Engineer of record', 'Placard']),
    )
  })

  it('fits its knowledge in the per-toolkit prompt cap with nothing cut', () => {
    const text = toolkitKnowledge([toolkit])
    expect(text.truncated).toEqual([])
    expect(text.text).toContain('within 8 hours')
    expect(text.text).toContain('Do not state a depth rule for engineered trench systems')
  })

  it('reuses the earthquake toolkit placard instead of duplicating it', () => {
    expect(toolkit.injectTypes).toContain('building_placard')
    const seismic = ToolkitSchema.parse(readJson('packs', 'toolkits', 'seismic.json'))
    expect(seismic.injectTypes).toContain('building_placard')
    expect(OWN).not.toContain('building_placard')
    expect(OWN.length).toBeGreaterThanOrEqual(12)
  })

  it('is proposed for a trench brief and for the domains it suits', () => {
    const base = { available: [toolkit], active: [], domainId: 'generic' }
    const hit = suggestToolkits({ ...base, text: 'A trench cave-in and a stop work order.' })
    expect(hit[0]).toMatchObject({ toolkitId: 'structures' })
    expect(suggestToolkits({ ...base, text: 'A coffee spill in the lobby.' })).toEqual([])
    for (const id of toolkit.appliesTo.domains) {
      expect(
        suggestToolkits({ ...base, text: 'x', domainId: id }).map((s) => s.toolkitId),
      ).toContain('structures')
    }
  })

  it('is on the suggested list of the domains it extends', () => {
    for (const id of toolkit.appliesTo.domains) {
      const d = DomainProfile.parse(readJson('packs', 'domains', `${id}.json`))
      expect(d.suggestedToolkits, id).toContain('structures')
    }
    expect(domain.suggestedToolkits).toContain('structures')
  })

  it('names only code the app has (lint rules, figure kinds and metrics)', () => {
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })
})

describe('structures products', () => {
  const ajv = new Ajv({ strict: false })

  it.each(OWN)('%s is a template with a taxonomy block and valid, rule-clean samples', (id) => {
    const dir = join(root, 'templates', 'injects', id)
    expect(existsSync(join(dir, 'template.html'))).toBe(true)
    const meta = TemplateMeta.parse(readJson('templates', 'injects', id, 'meta.json'))
    for (const v of meta.variants.length ? meta.variants : ['default'])
      expect(existsSync(join(dir, '__golden__', `${v}.png`)), `${id} ${v}`).toBe(true)
    expect(meta.type).toBe(id)
    expect(meta.taxonomy).toBeDefined()
    expect(meta.paper).toBe(true)
    const preview = TemplatePreview.parse(readJson('templates', 'injects', id, 'preview.json'))
    const validate = ajv.compile(readJson('templates', 'injects', id, 'schema.json') as object)
    expect(validate(preview.fields), JSON.stringify(validate.errors)).toBe(true)
    expect(fieldLintIssues(id, preview.fields as Record<string, unknown>)).toEqual([])
  })

  it('writes every placard category as words in the evaluation forms', () => {
    for (const id of ['rapid_evaluation_form', 'detailed_evaluation_form']) {
      const schema = readJson('templates', 'injects', id, 'schema.json') as {
        properties: { placard: { enum: string[] } }
      }
      expect(schema.properties.placard.enum).toEqual(
        expect.arrayContaining(['INSPECTED', 'RESTRICTED USE', 'UNSAFE']),
      )
    }
  })
})

describe('OSHA reporting regulation', () => {
  const reg = Regulation.parse(readJson('packs', 'regulations', 'osha_1904_39.json'))

  it('has an 8 hour fatality clock and a 24 hour injury clock', () => {
    const hours = (id: string) => reg.clocks.find((c) => c.id === id)?.dueAt[0]
    expect(hours('fatality')).toMatchObject({ amount: 8, unit: 'hours' })
    expect(hours('injury')).toMatchObject({ amount: 24, unit: 'hours' })
  })

  it('is on the construction domain and the report template is named by its clocks', () => {
    expect(domain.regulations).toContain('osha_1904_39')
    for (const c of reg.clocks) expect(c.injectTypes).toContain('osha_report_record')
  })
})

describe('construction domain with the toolkit', () => {
  it('offers the toolkit products through the toolkit, not the profile list', () => {
    for (const id of OWN) expect(domain.injectTypes).not.toContain(id)
  })
})

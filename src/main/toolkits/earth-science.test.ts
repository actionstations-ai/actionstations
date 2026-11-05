// The earth science toolkits (#668): each toolkit file is valid, names templates the pack ships,
// fits the knowledge budget without being cut, and every template preview matches its schema.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { ToolkitSchema, toolkitKnowledge, type Toolkit } from '@shared/toolkits'
import { BUNDLED_MAP } from '../packs/bundled-map'

const ROOT = join(__dirname, '..', '..', '..')
const PACK_ID = 'ai.actionstations.earth-science-toolkits'
const pack = BUNDLED_MAP.packs.find((p) => p.id === PACK_ID)!
const readJson = (...p: string[]): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, ...p), 'utf8')) as Record<string, unknown>
const toolkits = (): Toolkit[] =>
  pack.contents.toolkits.map((id) =>
    ToolkitSchema.parse(readJson('packs', 'toolkits', `${id}.json`)),
  )

describe('earth science toolkits', () => {
  it('are listed by the pack and each file id matches its name', () => {
    expect(pack.contents.toolkits.length).toBeGreaterThan(0)
    for (const id of pack.contents.toolkits)
      expect(toolkits().find((t) => t.id === id)?.id).toBe(id)
  })

  it('name only inject types the pack ships as templates', () => {
    for (const t of toolkits())
      for (const type of t.injectTypes)
        expect(pack.contents.templates, `${t.id}: ${type}`).toContain(type)
  })

  it('ship every template in a toolkit with its folder files', () => {
    for (const type of pack.contents.templates)
      for (const f of ['meta.json', 'schema.json', 'preview.json', 'template.html', 'style.css'])
        expect(existsSync(join(ROOT, 'templates', 'injects', type, f)), `${type}/${f}`).toBe(true)
  })

  it('keep their knowledge within the per-toolkit budget, uncut', () => {
    for (const t of toolkits()) {
      const k = toolkitKnowledge([t])
      expect(k.truncated, t.id).toEqual([])
      expect(k.text, t.id).toContain('Realism rules')
    }
  })

  it('give every decision form a time field and every lint rule a snake_case id', () => {
    for (const t of toolkits()) {
      for (const f of t.decisionForms)
        expect(
          f.fields.some((x) => x.kind === 'time'),
          `${t.id}/${f.id}`,
        ).toBe(true)
      for (const r of t.lintRules) expect(r).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it('have template previews that match their schemas', () => {
    const ajv = new Ajv2020({ strict: false })
    for (const type of pack.contents.templates) {
      const dir = join('templates', 'injects', type)
      const validate = ajv.compile(readJson(dir, 'schema.json'))
      const preview = readJson(dir, 'preview.json') as {
        fields: unknown
        variants?: Record<string, { fields: Record<string, unknown> }>
      }
      expect(validate(preview.fields), `${type}: ${JSON.stringify(validate.errors)}`).toBe(true)
      for (const [name, v] of Object.entries(preview.variants ?? {}))
        expect(
          validate({ ...(preview.fields as object), ...v.fields }),
          `${type}/${name}: ${JSON.stringify(validate.errors)}`,
        ).toBe(true)
    }
  })

  it('leave no stray template folders for the pack', () => {
    const dirs = readdirSync(join(ROOT, 'templates', 'injects'))
    for (const type of pack.contents.templates) expect(dirs).toContain(type)
  })
  it('point their document references at pinned, public-domain library documents', () => {
    const manifest = readJson('packs', 'documents', 'manifest.json') as unknown as {
      documents: { pack: string; slug: string; license: string; sha256: string | null }[]
    }
    const lib = manifest.documents.filter((d) => d.pack === 'geoscience-library')
    expect(lib.length).toBeGreaterThan(0)
    for (const d of lib) {
      expect(d.license).toBe('LicenseRef-US-Government-Work')
      expect(d.sha256, d.slug).toMatch(/^[0-9a-f]{64}$/)
    }
    for (const t of toolkits())
      for (const ref of t.documents) {
        expect(ref.packId).toBe('ai.actionstations.geoscience-library')
        expect(
          lib.map((d) => d.slug),
          `${t.id}: ${ref.documentId}`,
        ).toContain(ref.documentId)
      }
  })
})

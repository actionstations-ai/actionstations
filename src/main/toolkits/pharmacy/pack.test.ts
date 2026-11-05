// The bundled pharmacy toolkit pack (#899, #900): the toolkit and domain parse, the knowledge fits
// the prompt cap uncut, every product has a template folder whose preview validates against its
// schema and passes the toolkit's own lint rules, and the domain and toolkit agree.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { DomainProfile } from '@shared/domains/schema'
import { toolkitKnowledge, ToolkitSchema } from '@shared/toolkits'
import { TemplateMeta } from '../../render/templates'
import { fieldLintIssues } from '../lint-rules'
import { PHARMACY_LINT_RULES } from './lint'

const ROOT = join(__dirname, '../../../..')
const read = (rel: string): unknown => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
const toolkit = ToolkitSchema.parse(read('packs/toolkits/pharmacy.json'))
const domain = DomainProfile.parse(read('packs/domains/pharmacy.json'))

describe('pharmacy toolkit file', () => {
  it('has the stable id other fields reuse', () => {
    expect(toolkit.id).toBe('pharmacy')
  })

  it('fits the knowledge cap without cutting a line', () => {
    const out = toolkitKnowledge([toolkit])
    expect(out.truncated).toEqual([])
    expect(out.text).toContain('Never invent doses')
    expect(out.text).toContain('one business day')
  })

  it('names exactly the lint rules the app ships', () => {
    expect([...toolkit.lintRules].sort()).toEqual([...PHARMACY_LINT_RULES].sort())
  })

  it('is proposed for the domains that use it, including its own', () => {
    for (const d of ['pharmacy', 'healthcare', 'nursing', 'health_informatics', 'public_health'])
      expect(toolkit.appliesTo.domains, d).toContain(d)
  })

  it('keeps real vendors and payers out of the advisor roles', () => {
    expect(JSON.stringify(toolkit.advisorRoles)).not.toMatch(
      /Surescripts|Change Healthcare|McKesson/i,
    )
  })
})

describe('pharmacy domain and toolkit agree', () => {
  it('suggests the toolkit, with drug shortage as the default family', () => {
    expect(domain.suggestedToolkits).toContain('pharmacy')
    expect(domain.threatFamilies[0]).toBe('drug_shortage')
  })

  it('lists the domain in the media environment toolkit', () => {
    const media = ToolkitSchema.parse(read('packs/toolkits/media_environment.json'))
    expect(media.appliesTo.domains).toContain('pharmacy')
    expect(domain.suggestedToolkits).toContain('media_environment')
  })
})

describe('pharmacy templates', () => {
  it('has a folder, a taxonomy block and a valid preview for every inject type', () => {
    expect(toolkit.injectTypes).toHaveLength(14)
    for (const type of toolkit.injectTypes) {
      const dir = `templates/injects/${type}`
      for (const f of ['meta.json', 'schema.json', 'preview.json', 'template.html', 'style.css'])
        expect(existsSync(join(ROOT, dir, f)), `${dir}/${f}`).toBe(true)
      const meta = TemplateMeta.parse(read(`${dir}/meta.json`))
      for (const variant of meta.variants.length ? meta.variants : ['default'])
        expect(
          existsSync(join(ROOT, dir, '__golden__', `${variant}.png`)),
          `${type} ${variant} golden`,
        ).toBe(true)
      expect(meta.type).toBe(type)
      expect(meta.taxonomy, `${type} taxonomy`).toBeTruthy()
      const validate = new Ajv2020({ strict: false }).compile(read(`${dir}/schema.json`) as object)
      const preview = read(`${dir}/preview.json`) as { fields: unknown }
      expect(validate(preview.fields), `${type}: ${JSON.stringify(validate.errors)}`).toBe(true)
    }
  })

  it('passes its own format rules on every preview', () => {
    for (const type of toolkit.injectTypes) {
      const preview = read(`templates/injects/${type}/preview.json`) as {
        fields: Record<string, unknown>
      }
      expect(fieldLintIssues(type, preview.fields), type).toEqual([])
    }
  })

  it('never marks a record as real', () => {
    for (const type of toolkit.injectTypes) {
      const preview = JSON.stringify(read(`templates/injects/${type}/preview.json`))
      expect(preview, type).toMatch(/fictional|EXERCISE/i)
    }
  })
})

describe('pharmacy reference library', () => {
  const manifest = read('packs/documents/manifest.json') as {
    libraries: Record<string, { domain: string }>
    documents: {
      pack: string
      alsoIn?: string[]
      slug: string
      sha256: string | null
      license: string
    }[]
  }

  it('lists each document the toolkit names, pinned, with its license', () => {
    expect(manifest.libraries['pharmacy-library']?.domain).toBe('pharmacy')
    expect(toolkit.documents.length).toBeGreaterThanOrEqual(4)
    for (const ref of toolkit.documents) {
      expect(ref.packId).toBe('ai.actionstations.pharmacy-library')
      const doc = manifest.documents.find((d) => d.slug === ref.documentId)
      expect(doc, ref.documentId).toBeDefined()
      expect([doc!.pack, ...(doc!.alsoIn ?? [])], ref.documentId).toContain('pharmacy-library')
      expect(doc!.sha256, ref.documentId).toMatch(/^[0-9a-f]{64}$/)
      expect(['LicenseRef-US-Government-Work', 'LicenseRef-Publisher-Terms']).toContain(
        doc!.license,
      )
    }
    // only the ASHP guidelines carry their publisher's terms
    expect(
      toolkit.documents
        .map((r) => manifest.documents.find((d) => d.slug === r.documentId)!)
        .filter((d) => d.license === 'LicenseRef-Publisher-Terms')
        .map((d) => d.slug),
    ).toEqual(['ashp-managing-drug-product-shortages'])
  })
})

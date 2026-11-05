// The wildfire reference library (spec 0461 FR-15): every bundled document is a verified public
// domain work pinned by hash, every other reference is linked with a reason, and the toolkit
// points at documents that exist.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ToolkitSchema } from '@shared/toolkits'

interface Doc {
  pack: string
  slug: string
  file: string
  title: string
  publisher: string
  url: string
  license: string
  basis: string
  sha256?: string
  size?: number
  pinned?: string
}
interface Link {
  pack: string
  title: string
  url: string
  reason: string
}
const manifest = JSON.parse(readFileSync(resolve('packs/documents/manifest.json'), 'utf8')) as {
  libraries: Record<string, { domain: string; version: string }>
  documents: Doc[]
  links: Link[]
}
const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/wildfire.json'), 'utf8')),
)
const docs = manifest.documents.filter((d) => d.pack === 'wildfire-library')
const links = manifest.links.filter((l) => l.pack === 'wildfire-library')

describe('wildfire library', () => {
  it('is a library for the wildfire domain with a version', () => {
    expect(manifest.libraries['wildfire-library']).toMatchObject({ domain: 'wildfire' })
    expect(manifest.libraries['wildfire-library']!.version).toMatch(/^\d+\.\d+\.\d+$/)
  })
  it('bundles pinned documents, each with its license and the basis for it', () => {
    expect(docs.length).toBeGreaterThanOrEqual(9)
    for (const d of docs) {
      expect(['LicenseRef-US-Government-Work', 'LicenseRef-Publisher-Terms'], d.slug).toContain(
        d.license,
      )
      expect(d.basis.length, d.slug).toBeGreaterThan(30)
      expect(d.sha256, d.slug).toMatch(/^[0-9a-f]{64}$/)
      expect(d.size, d.slug).toBeGreaterThan(10_000)
      expect(d.pinned, d.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(d.file, d.slug).toBe(`${d.slug}.pdf`)
      expect(d.url, d.slug).toMatch(/^https:\/\//)
    }
  })
  it('names the documents the dossier asks for: fire weather, the AQI and the NWCG guide', () => {
    const slugs = docs.map((d) => d.slug).join(' ')
    for (const part of ['nwsi-10-401', 'epa-aqi-technical-assistance', 'nwcg-incident-response'])
      expect(slugs).toContain(part)
  })
  it('carries the smoke guide, the Marshall Fire report, the CPUC decision and Ready, Set, Go!', () => {
    const slugs = docs.map((d) => d.slug)
    expect(slugs).toEqual(
      expect.arrayContaining([
        'epa-wildfire-smoke-guide-2026',
        'marshall-fire-after-action-report',
        'cpuc-d-19-05-042-psps-phase-1',
        'iafc-ready-set-go-action-guide',
      ]),
    )
  })
  it('links what it does not bundle, each with a reason', () => {
    const titles = links.map((l) => l.title).join(' | ')
    for (const part of ['Glossary of Wildland Fire', 'Lahaina']) expect(titles).toContain(part)
    for (const l of links) {
      expect(l.reason.length, l.title).toBeGreaterThan(30)
      expect(l.url, l.title).toMatch(/^https:\/\//)
    }
  })
  it('does not bundle a document that is also linked', () => {
    const bundledUrls = new Set(docs.map((d) => d.url))
    for (const l of links) expect(bundledUrls.has(l.url), l.title).toBe(false)
  })
  it('is what the toolkit points to, and every pointer resolves', () => {
    expect(toolkit.documents.length).toBe(docs.length)
    for (const ref of toolkit.documents) {
      expect(ref.packId).toBe('ai.actionstations.wildfire-library')
      expect(
        docs.map((d) => d.slug),
        ref.documentId,
      ).toContain(ref.documentId)
    }
  })
})

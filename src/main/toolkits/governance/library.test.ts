// The governance reference library (spec 0459 FR-12): the documents the toolkit points to are
// in the library (or the core pack), pinned by hash and public domain, and what is only linked
// is named with a reason.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ToolkitSchema } from '@shared/toolkits'

const read = (p: string): unknown => JSON.parse(readFileSync(resolve(p), 'utf8'))
const toolkit = ToolkitSchema.parse(read('packs/toolkits/governance.json'))
const manifest = read('packs/documents/manifest.json') as {
  documents: {
    slug: string
    pack: string
    alsoIn?: string[]
    license: string
    sha256: string | null
  }[]
  links: { pack: string; title: string; reason: string }[]
  libraries: Record<string, { domain: string }>
}

describe('governance document library', () => {
  it('is a library for the governance domain', () => {
    expect(manifest.libraries['governance-library']?.domain).toBe('governance')
  })

  it('carries every document the toolkit names, pinned and public domain', () => {
    expect(toolkit.documents.length).toBeGreaterThan(0)
    for (const ref of toolkit.documents) {
      const doc = manifest.documents.find((d) => d.slug === ref.documentId)
      expect(doc, ref.documentId).toBeDefined()
      const packs = [doc!.pack, ...(doc!.alsoIn ?? [])].map((p) => `ai.actionstations.${p}`)
      expect(packs, ref.documentId).toContain(ref.packId)
      expect(doc!.sha256, ref.documentId).toMatch(/^[0-9a-f]{64}$/)
      expect(doc!.license).toBe('LicenseRef-US-Government-Work')
    }
  })

  it('links, with a reason, to what it does not bundle', () => {
    const links = manifest.links.filter((l) => l.pack === 'governance-library')
    const titles = links.map((l) => l.title).join(' ')
    expect(titles).toMatch(/Executives and Senior Leadership/)
    expect(titles).toMatch(/ISO 22301/)
    expect(titles).toMatch(/Compliance and Disclosure Interpretations/)
    for (const l of links) expect(l.reason.length).toBeGreaterThan(10)
  })
})

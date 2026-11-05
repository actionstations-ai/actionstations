// Reuse and library of the EMS, fire and hazmat toolkits (spec 0456 FR-13, FR-15): every domain a
// toolkit applies to suggests it, and each document a toolkit lists is a pinned library entry.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile } from '@shared/domains/schema'
import { ToolkitSchema } from '@shared/toolkits'

const readJson = (...parts: string[]): unknown =>
  JSON.parse(readFileSync(resolve(...parts), 'utf8'))
const manifest = readJson('packs', 'documents', 'manifest.json') as {
  libraries: Record<string, unknown>
  documents: { pack: string; slug: string; sha256?: string; alsoIn?: string[] }[]
}

describe.each(['mci_triage', 'hazmat', 'dispatch'])('%s reuse', (id) => {
  const toolkit = ToolkitSchema.parse(readJson('packs', 'toolkits', `${id}.json`))

  it('is suggested by every other domain it applies to', () => {
    for (const domainId of toolkit.appliesTo.domains.filter((d) => d !== 'ems_fire')) {
      const domain = DomainProfile.parse(readJson('packs', 'domains', `${domainId}.json`))
      expect(domain.suggestedToolkits, domainId).toContain(id)
    }
  })

  it('lists only documents that the library pins and carries', () => {
    for (const ref of toolkit.documents) {
      const entry = manifest.documents.find((d) => d.slug === ref.documentId)
      expect(entry, ref.documentId).toBeDefined()
      expect(entry?.sha256).toMatch(/^[0-9a-f]{64}$/)
      const libraryId = ref.packId.replace('ai.actionstations.', '')
      expect(manifest.libraries[libraryId]).toBeDefined()
      expect([entry?.pack, ...(entry?.alsoIn ?? [])]).toContain(libraryId)
    }
  })
})

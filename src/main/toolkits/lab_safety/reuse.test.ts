// Reuse and the library (#885, #892): the domains the toolkit says it suits suggest it, the
// documents it names are pinned in the library with a verified license, and the guide is linked.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DomainProfile } from '@shared/domains/schema'
import { ToolkitSchema } from '@shared/toolkits'

const ROOT = join(__dirname, '../../../..')
const json = (rel: string) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
const toolkit = ToolkitSchema.parse(json('packs/toolkits/lab_safety.json'))
const manifest = json('packs/documents/manifest.json') as {
  libraries: Record<string, { domain: string; version: string }>
  documents: {
    pack: string
    slug: string
    license: string
    sha256: string
    size: number
    basis: string
  }[]
  links: { pack: string; title: string; reason: string }[]
}

describe('reuse by other domains', () => {
  it('suggests the toolkit in every domain it says it suits, and no other', () => {
    for (const id of toolkit.appliesTo.domains) {
      const domain = DomainProfile.parse(json(`packs/domains/${id}.json`))
      expect(domain.suggestedToolkits, id).toContain('lab_safety')
    }
  })

  it('is suggested to healthcare, campus, public health and K-12, and food and agriculture', () => {
    for (const id of ['healthcare', 'campus', 'public_health', 'k12_schools', 'food_agriculture'])
      expect(toolkit.appliesTo.domains).toContain(id)
  })

  it('lists the lab regulations on the research labs domain', () => {
    const domain = DomainProfile.parse(json('packs/domains/research_labs.json'))
    for (const id of [
      'select_agent_73_19',
      'nih_guidelines_incident_reporting',
      'nih_biosafety_policy_draft',
      'lab_institution_deadlines',
    ]) {
      expect(domain.regulations, id).toContain(id)
      expect(existsSync(join(ROOT, `packs/regulations/${id}.json`)), id).toBe(true)
    }
  })
})

describe('reference library', () => {
  const docs = manifest.documents.filter((d) => d.pack === 'research-labs-library')

  it('is a library for the research labs domain', () => {
    expect(manifest.libraries['research-labs-library']!.domain).toBe('research_labs')
  })

  it('bundles the regulations, the BMBL, the NIH Guidelines and the incident response guidance, pinned by hash, with the reason', () => {
    expect(docs.map((d) => d.slug)).toEqual([
      'cfr-42-part-73',
      'cdc-nih-bmbl-6',
      'nih-guidelines-recombinant-synthetic',
      'fsap-incident-response-plan-guidance',
    ])
    for (const d of docs) {
      expect(d.license).toBe('LicenseRef-US-Government-Work')
      expect(d.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(d.size).toBeGreaterThan(0)
      expect(d.basis).toMatch(/17 U\.S\.C\./)
    }
  })

  it('links, rather than copies, the draft policy and the select agent web form', () => {
    const links = manifest.links.filter((l) => l.pack === 'research-labs-library')
    expect(links.map((l) => l.title).join('|')).toMatch(/NOT-OD-26-112.*Form 3/)
    for (const l of links) expect(l.reason.length).toBeGreaterThan(20)
  })

  it('names in the toolkit only documents the library carries', () => {
    for (const ref of toolkit.documents) {
      expect(ref.packId).toBe('ai.actionstations.research-labs-library')
      expect(docs.map((d) => d.slug)).toContain(ref.documentId)
    }
  })
})

describe('user guide', () => {
  it('is linked from the toolkits guide and the README', () => {
    expect(readFileSync(join(ROOT, 'docs/guides/toolkits.md'), 'utf8')).toContain(
      'research-labs.md',
    )
    expect(readFileSync(join(ROOT, 'README.md'), 'utf8')).toContain('docs/guides/research-labs.md')
  })

  it('covers the four topics the spec lists', () => {
    const text = readFileSync(join(ROOT, 'docs/guides/research-labs.md'), 'utf8')
    for (const heading of [
      'Choosing clocks',
      'Why the guardrails restrict content',
      'Editing institution policy clocks',
      'Keeping an exercise at the incident management level',
    ])
      expect(text).toContain(`## ${heading}`)
  })
})

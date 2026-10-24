// packs/documents/manifest.json (#325): the real manifest parses, and the schema refuses the
// mistakes that would let a non-public-domain or unpinnable entry through.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DocumentsManifest,
  documentsOf,
  libraryPacks,
  linksOf,
  type ManifestDocument,
} from './manifest'

const ROOT = join(__dirname, '..', '..', '..', '..')
const raw = JSON.parse(readFileSync(join(ROOT, 'packs', 'documents', 'manifest.json'), 'utf8'))

const doc = (over: Partial<ManifestDocument> = {}): Record<string, unknown> => ({
  pack: 'airport-library',
  slug: 'faa-ac',
  file: 'faa-ac.pdf',
  title: 'An advisory circular',
  publisher: 'FAA',
  edition: 'May 2024',
  url: 'https://www.faa.gov/ac.pdf',
  sha256: 'a'.repeat(64),
  size: 10,
  license: 'LicenseRef-US-Government-Work',
  basis: 'US federal government work (17 U.S.C. §105): FAA',
  ...over,
})
const manifest = (docs: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  formatVersion: 1,
  libraries: {
    'airport-library': {
      name: 'Airport reference library',
      summary: 'FAA material.',
      domain: 'airport',
      version: '1.0.0',
    },
  },
  documents: docs,
  ...extra,
})
const issues = (data: unknown): string[] => {
  const r = DocumentsManifest.safeParse(data)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe('packs/documents/manifest.json', () => {
  const m = DocumentsManifest.parse(raw)

  it('parses, and every document has a public-domain license and basis', () => {
    expect(m.documents.length).toBeGreaterThan(100)
    for (const d of m.documents) {
      expect(['LicenseRef-US-Government-Work', 'CC0-1.0']).toContain(d.license)
      expect(d.basis.length).toBeGreaterThan(10)
      expect(new URL(d.url).protocol).toBe('https:')
    }
  })

  it('has a core set with the HSEEP doctrine and templates, NIMS, CPG 101 and the ICS forms', () => {
    const core = documentsOf(m, 'core').map((d) => d.slug)
    expect(core).toEqual(
      expect.arrayContaining([
        'hseep-2020',
        'hseep-templates',
        'nims-2017',
        'cpg-101',
        'ics-forms-booklet',
      ]),
    )
  })

  it('has a library per researched domain, each with documents and metadata', () => {
    const libs = libraryPacks(m)
    expect(libs.length).toBeGreaterThanOrEqual(20)
    for (const p of libs) {
      expect(documentsOf(m, p).length).toBeGreaterThan(0)
      expect(m.libraries[p]?.name).toMatch(/reference library$/)
    }
  })

  it('keeps the owner’s link-only references out of the documents', () => {
    const urls = m.documents.flatMap((d) => [d.url, ...d.mirrors])
    for (const pattern of [
      /asprtracie/i,
      /StopRansomware-Guide/i,
      /aa22-131a/i,
      /joint-guid/i,
      /\/ERG/i,
      /nerc\.com/i,
      /c2m2/i,
    ])
      expect(urls.filter((u) => pattern.test(u))).toEqual([])
    expect(linksOf(m, 'healthcare-library').some((l) => /asprtracie/.test(l.url))).toBe(true)
  })

  it('does not repeat a core document in a library', () => {
    const coreUrls = new Set(documentsOf(m, 'core').map((d) => d.url))
    for (const p of libraryPacks(m))
      expect(
        documentsOf(m, p)
          .filter((d) => coreUrls.has(d.url))
          .map((d) => d.slug),
      ).toEqual([])
  })
})

describe('DocumentsManifest schema', () => {
  it('accepts a minimal valid manifest, unpinned documents included', () => {
    expect(
      issues(
        manifest([doc(), doc({ slug: 'other', file: 'other.pdf', sha256: null, size: null })]),
      ),
    ).toEqual([])
  })

  it('refuses licenses other than US government work or CC0', () => {
    expect(issues(manifest([doc({ license: 'CC-BY-4.0' as never })]))).not.toEqual([])
  })

  it('refuses a file name that is not <slug>.<ext> or not a document format', () => {
    expect(issues(manifest([doc({ file: 'other.pdf' })]))).toContain('file must be <slug>.<ext>')
    expect(issues(manifest([doc({ file: 'faa-ac.exe' })]))).toContain(
      '.exe is not a document format',
    )
  })

  it('needs process "extract" for a zip, and strip-cover only on a docx', () => {
    expect(issues(manifest([doc({ file: 'faa-ac.zip' })]))).toContain(
      'a .zip needs process "extract", and only a .zip',
    )
    expect(issues(manifest([doc({ process: 'strip-cover' })]))).toContain(
      'strip-cover works on .docx only',
    )
  })

  it('pins sha256 and size together', () => {
    expect(issues(manifest([doc({ size: null })]))).toContain('sha256 and size are pinned together')
  })

  it('refuses a duplicate slug and a pack without library metadata', () => {
    expect(issues(manifest([doc(), doc()]))).toContain('Duplicate slug "faa-ac"')
    expect(issues(manifest([doc({ pack: 'rail-library' })]))).toContain(
      'No libraries entry for "rail-library"',
    )
  })

  it('refuses a pack name that is neither core nor a library, and plain-http URLs', () => {
    expect(issues(manifest([doc({ pack: 'airport' as never })]))).not.toEqual([])
    expect(issues(manifest([doc({ url: 'ftp://example.org/a.pdf' })]))).not.toEqual([])
  })
})

// build-library-packs (#325): a library pack built from a fixture cache validates with the
// app's reader, is byte-for-byte reproducible, blanks CTEP cover photos, unpacks archives
// without legacy formats, and lists every document and link in its README.
import { describe, expect, it, vi } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { buildLibraryPacks, loadDocument } = await import('./library-build')
const { DocumentsManifest } = await import('./manifest')
const { readPack } = await import('../reader')
const { stripCover, safeName, memberTitle } = await import('./process')

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
const PDF = Buffer.from('%PDF-1.7\n% fixture\n%%EOF\n')
const PHOTO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(40 * 1024)])
const LOGO = Buffer.from('logo-png-bytes')

async function ctepDocx(): Promise<Buffer> {
  const z = new JSZip()
  z.file('[Content_Types].xml', '<Types/>')
  z.file(
    'word/document.xml',
    '<w:document><w:body><w:drawing><a:blip r:embed="rId5"/></w:drawing><w:t>[Enter Organization Name]</w:t></w:body></w:document>',
  )
  z.file(
    'word/_rels/document.xml.rels',
    '<Relationships><Relationship Id="rId5" Type="image" Target="media/image1.jpeg"/><Relationship Id="rId6" Type="image" Target="media/image2.png"/></Relationships>',
  )
  z.file('word/media/image1.jpeg', PHOTO)
  z.file('word/media/image2.png', LOGO)
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

async function templatesZip(): Promise<Buffer> {
  const z = new JSZip()
  z.file(
    'Conduct/Player Brief Presentation_Conduct_HSEEP Template_2020_508.pptx',
    Buffer.from('PK\x03\x04pptx'),
  )
  z.file(
    'Design and Development/Master Scenario Events List_HSEEP Template_2020_508.xls',
    Buffer.from('legacy'),
  )
  z.file('Evaluation/After-Action Report_HSEEP Template.docx', Buffer.from('PK\x03\x04docx'))
  z.file('__MACOSX/._junk', 'x')
  return z.generateAsync({ type: 'nodebuffer' })
}

interface Fixture {
  cacheDir: string
  outDir: string
  manifest: ReturnType<typeof DocumentsManifest.parse>
}

async function fixture(): Promise<Fixture> {
  const cacheDir = mkdtempSync(join(tmpdir(), 'ttx-lib-cache-'))
  const outDir = mkdtempSync(join(tmpdir(), 'ttx-lib-out-'))
  const files: Record<string, Buffer> = {
    'rail-guide': PDF,
    'ctep-rail': await ctepDocx(),
    'rail-templates': await templatesZip(),
  }
  const ext = { 'rail-guide': 'pdf', 'ctep-rail': 'docx', 'rail-templates': 'zip' } as const
  for (const [slug, bytes] of Object.entries(files)) {
    mkdirSync(join(cacheDir, slug), { recursive: true })
    writeFileSync(join(cacheDir, slug, `${slug}.${ext[slug as keyof typeof ext]}`), bytes)
  }
  const base = {
    pack: 'freight-rail-library',
    publisher: 'TSA',
    edition: 'January 2026',
    license: 'LicenseRef-US-Government-Work',
    basis: 'US federal government work (17 U.S.C. §105): TSA',
    pinned: '2026-10-24',
  }
  const manifest = DocumentsManifest.parse({
    formatVersion: 1,
    libraries: {
      'freight-rail-library': {
        name: 'Freight rail reference library',
        summary: 'Rail security directives and CFR parts.',
        domain: 'freight_rail',
        version: '1.0.0',
      },
    },
    documents: [
      {
        ...base,
        slug: 'rail-guide',
        file: 'rail-guide.pdf',
        title: 'Rail security guide',
        url: 'https://www.tsa.gov/rail.pdf',
        sha256: sha256(files['rail-guide']!),
        size: PDF.length,
      },
      {
        ...base,
        slug: 'ctep-rail',
        file: 'ctep-rail.docx',
        title: 'Rail CTEP Situation Manual',
        url: 'https://www.cisa.gov/ctep.docx',
        process: 'strip-cover',
        sha256: sha256(files['ctep-rail']!),
        size: files['ctep-rail']!.length,
      },
      {
        ...base,
        slug: 'rail-templates',
        file: 'rail-templates.zip',
        title: 'Rail templates',
        url: 'https://www.fema.gov/t.zip',
        process: 'extract',
        sha256: sha256(files['rail-templates']!),
        size: files['rail-templates']!.length,
      },
    ],
    links: [
      {
        pack: 'freight-rail-library',
        title: 'Emergency Response Guidebook',
        publisher: 'PHMSA',
        url: 'https://www.phmsa.dot.gov/erg',
        reason: 'Owner decision: link only',
      },
    ],
  })
  return { cacheDir, outDir, manifest }
}

const opts = (f: Fixture) => ({ cacheDir: f.cacheDir, outDir: f.outDir, appVersion: '0.3.0' })

describe('buildLibraryPacks', () => {
  it('builds a library pack the reader accepts', async () => {
    const f = await fixture()
    const r = await buildLibraryPacks(f.manifest, opts(f))
    expect(r.problems).toEqual([])
    expect(r.packs.map((p) => p.file)).toEqual([
      'ai.actionstations.freight-rail-library-1.0.0.aspack',
    ])
    const read = await readPack(
      { path: join(f.outDir, r.packs[0]!.file) },
      {
        appVersion: '0.3.0',
        builtins: { templates: [], prompts: [], workflows: [], examples: [] },
      },
    )
    expect(read.ok).toBe(true)
    if (!read.ok) return
    const m = read.pack.manifest
    expect(m.id).toBe('ai.actionstations.freight-rail-library')
    expect(m.domains).toEqual(['freight_rail'])
    expect(m.contents.documents).toEqual(['ctep-rail', 'rail-guide', 'rail-templates'])
    expect(m.documents.map((d) => d.path)).toEqual([
      'documents/ctep-rail/ctep-rail.docx',
      'documents/rail-guide/rail-guide.pdf',
      'documents/rail-templates/After-Action-Report.docx',
      'documents/rail-templates/Player-Brief-Presentation_Conduct.pptx',
    ])
    expect(m.documents[1]).toMatchObject({
      license: 'LicenseRef-US-Government-Work',
      source: 'TSA, https://www.tsa.gov/rail.pdf',
    })
    const entries = JSON.parse(readFileSync(join(f.outDir, 'catalog-entries.json'), 'utf8'))
    expect(entries[0]).toMatchObject({
      id: m.id,
      kinds: ['documents'],
      sha256: read.pack.archiveSha256,
      updated: '2026-10-24T00:00:00Z',
    })
  })

  it('is reproducible: the same cache gives the same archive bytes', async () => {
    const f = await fixture()
    const a = await buildLibraryPacks(f.manifest, opts(f))
    const g = { ...f, outDir: mkdtempSync(join(tmpdir(), 'ttx-lib-out-')) }
    const b = await buildLibraryPacks(g.manifest, opts(g))
    expect(a.packs[0]?.sha256).toBe(b.packs[0]?.sha256)
  })

  it('writes a README with every document, the left-out legacy file and the links', async () => {
    const f = await fixture()
    const r = await buildLibraryPacks(f.manifest, opts(f))
    const zip = await JSZip.loadAsync(readFileSync(join(f.outDir, r.packs[0]!.file)))
    const readme = await zip.file('README.md')!.async('string')
    expect(readme).toContain(
      '| Rail security guide | TSA | January 2026 | <https://www.tsa.gov/rail.pdf> |',
    )
    expect(readme).toContain(
      'Master Scenario Events List_HSEEP Template_2020_508.xls left out (legacy .xls format',
    )
    expect(readme).toContain(
      '| Emergency Response Guidebook | PHMSA | <https://www.phmsa.dot.gov/erg> | Owner decision: link only |',
    )
    expect(readme).toMatch(/cover photo word\/media\/image1\.jpeg replaced/)
  })

  it('fails on a document missing from the cache unless --allow-missing, then lists it as a link', async () => {
    const f = await fixture()
    const m = DocumentsManifest.parse({
      ...f.manifest,
      documents: [
        ...f.manifest.documents,
        {
          ...f.manifest.documents[0]!,
          slug: 'gone',
          file: 'gone.pdf',
          url: 'https://www.tsa.gov/gone.pdf',
        },
      ],
    })
    const strict = await buildLibraryPacks(m, opts(f))
    expect(strict.packs).toEqual([])
    expect(strict.problems.join('\n')).toMatch(/gone not in the cache/)
    const lenient = await buildLibraryPacks(m, { ...opts(f), allowMissing: true })
    expect(lenient.problems).toEqual([])
    expect(lenient.packs[0]?.missing).toEqual(['gone'])
  })

  it('refuses a cached file that does not match its pinned sha256', async () => {
    const f = await fixture()
    writeFileSync(
      join(f.cacheDir, 'rail-guide', 'rail-guide.pdf'),
      Buffer.from('%PDF-1.7 tampered'),
    )
    const r = await loadDocument(f.manifest.documents[0]!, f.cacheDir)
    expect(r).toEqual({ problem: expect.stringMatching(/does not match the pinned sha256/) })
  })
})

describe('stripCover', () => {
  it('blanks the first body image when it is a photo and keeps everything else', async () => {
    const { bytes, replaced } = await stripCover(await ctepDocx())
    expect(replaced).toBe('word/media/image1.jpeg')
    const z = await JSZip.loadAsync(bytes)
    const cover = await z.file('word/media/image1.jpeg')!.async('nodebuffer')
    expect(cover.length).toBeLessThan(1024)
    expect(cover.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
    expect(await z.file('word/media/image2.png')!.async('nodebuffer')).toEqual(LOGO)
    expect(await z.file('word/document.xml')!.async('string')).toContain(
      '[Enter Organization Name]',
    )
  })

  it('leaves an image deep in the body alone (older CTEPs have a cover placeholder instead)', async () => {
    const z = await JSZip.loadAsync(await ctepDocx())
    const body = await z.file('word/document.xml')!.async('string')
    z.file('word/document.xml', body.replace('<w:body>', `<w:body>${'<w:p/>'.repeat(5000)}`))
    const { replaced } = await stripCover(await z.generateAsync({ type: 'nodebuffer' }))
    expect(replaced).toBeUndefined()
  })

  it('blanks .jfif and .emf covers with a file of the same format', async () => {
    for (const ext of ['jfif', 'emf']) {
      const z = await JSZip.loadAsync(await ctepDocx())
      z.remove('word/media/image1.jpeg')
      z.file(`word/media/image1.${ext}`, PHOTO)
      const rels = await z.file('word/_rels/document.xml.rels')!.async('string')
      z.file('word/_rels/document.xml.rels', rels.replace('image1.jpeg', `image1.${ext}`))
      const out = await stripCover(await z.generateAsync({ type: 'nodebuffer' }))
      expect(out.replaced).toBe(`word/media/image1.${ext}`)
      const blank = await (
        await JSZip.loadAsync(out.bytes)
      )
        .file(`word/media/image1.${ext}`)!
        .async('nodebuffer')
      if (ext === 'emf') expect(blank.readUInt32LE(40)).toBe(0x464d4520)
      else expect(blank.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
    }
  })
})

describe('safeName', () => {
  it('makes archive member names pack-safe', () => {
    expect(safeName('Conduct/Actor Brief (v2) & Notes.docx')).toBe('Actor-Brief-v2-Notes.docx')
    expect(safeName('-weird.pdf')).toBe('weird.pdf')
    expect(safeName('x/Exercise Plan_Design and Development_HSEEP Template_2020_508.docx')).toBe(
      'Exercise-Plan_Design-and-Development.docx',
    )
    expect(safeName(`${'Long name '.repeat(20)}.pptx`).length).toBeLessThanOrEqual(96)
  })

  it('titles a member "Name (Stage)" without the template marking', () => {
    expect(
      memberTitle('Conduct/Player Brief Presentation_Conduct_HSEEP Template_2020_508.pptx'),
    ).toBe('Player Brief Presentation (Conduct)')
  })
})

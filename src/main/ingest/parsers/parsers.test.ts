import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  OCR_SAMPLE,
  buildPdf,
  scanImage,
  writeFixtures,
  type PdfTextLine,
} from '../../../../tests/fixtures/ingest/builders'
import { buildHeadingPath } from '../headings'
import type { ParsedDocument } from '../types'
import { parseFile, parserKindFor } from '.'

let fixtures: Awaited<ReturnType<typeof writeFixtures>>
const dir = mkdtempSync(join(tmpdir(), 'ttx-parsers-'))

beforeAll(async () => {
  fixtures = await writeFixtures(dir)
})

const paths = (doc: ParsedDocument, short: string) =>
  doc.sections.map((s) => buildHeadingPath(short, s.headingPath))
const allText = (doc: ParsedDocument) => doc.sections.map((s) => s.text).join('\n\n')

describe('parserKindFor', () => {
  it('maps extensions and rejects unknown types', () => {
    expect(parserKindFor('/x/Plan.PDF')).toBe('pdf')
    expect(parserKindFor('a.jpeg')).toBe('image')
    expect(() => parserKindFor('a.exe')).toThrow(/Unsupported file type/)
  })
})

describe('PDF parser', () => {
  it('detects the title, SECTION and numbered headings by font size/weight, and keeps pages', async () => {
    const doc = await parseFile(fixtures.pdf, 'plan.pdf')
    expect(doc.title).toBe('Terminal Incident Response Plan (TIRP)')
    expect(doc.pages).toBe(3)
    expect(paths(doc, 'TIRP')).toContain('TIRP › Section 2 › 2.3 Procedures for case 3')
    const s23 = doc.sections.find((s) => s.headingPath.at(-1) === '2.3 Procedures for case 3')
    expect(s23?.page).toBe(2)
    // Body lines are joined into paragraphs; the 4th line starts a new paragraph.
    expect(s23?.text.split('\n\n')).toHaveLength(2)
  })

  it('drops running headers and page-number footers', async () => {
    const doc = await parseFile(fixtures.pdf, 'plan.pdf')
    expect(allText(doc)).not.toMatch(/Revision 1\.0/)
    expect(allText(doc)).not.toMatch(/Page \d/)
  })

  it('falls back to the metadata title and reports scanned PDFs clearly', async () => {
    const titled = join(dir, 'titled.pdf')
    writeFileSync(
      titled,
      buildPdf([{ lines: [{ text: 'Just body text.', size: 10 }] }], {
        title: 'Mutual Aid Agreement',
      }),
    )
    expect((await parseFile(titled)).title).toBe('Mutual Aid Agreement')
    const empty = join(dir, 'empty.pdf')
    writeFileSync(empty, buildPdf([{ lines: [] }]))
    await expect(parseFile(empty)).rejects.toThrow(/No extractable text/)
  })
})

describe('DOCX parser', () => {
  it('maps Word headings to the outline, keeps tables as pipe tables', async () => {
    const doc = await parseFile(fixtures.docx, 'aep.docx')
    expect(doc.title).toBe('Airport Emergency Plan (AEP)')
    expect(paths(doc, 'AEP')).toContain(
      'AEP › Part II › Appendix 6 › 6.2 Critical Systems & Impact',
    )
    const text = allText(doc)
    expect(text).toContain('FIDS failure forces manual gate announcements.')
    expect(text).toContain('| System | Impact |')
    expect(text).toContain('| BHS | Manual bag sort |')
  })
})

describe('PPTX parser', () => {
  it('uses presentation order, slide titles as headings, slide numbers as pages, and notes', async () => {
    const doc = await parseFile(fixtures.pptx, 'briefing.pptx')
    expect(doc.title).toBe('Player Briefing')
    expect(doc.pages).toBe(2)
    expect(doc.sections.map((s) => [s.headingPath[0], s.page])).toEqual([
      ['Exercise Overview', 1],
      ['Scenario C: FIDS Failure', 2],
    ])
    expect(doc.sections[0]!.text).toContain('STARTEX 0900')
    expect(doc.sections[0]!.text).toContain('Speaker notes: Remind players this is no-fault.')
    expect(doc.sections[0]!.text).not.toContain('img')
    expect(doc.sections[1]!.text).toContain('| FIDS | Down |')
  })
})

describe('XLSX parser', () => {
  it('emits one pipe table per sheet with rich text and formula results', async () => {
    const doc = await parseFile(fixtures.xlsx, 'contacts.xlsx')
    expect(doc.pages).toBe(2)
    expect(doc.sections.map((s) => s.headingPath)).toEqual([['Contacts'], ['Systems']])
    expect(doc.sections[0]!.text.split('\n')[0]).toBe('| Role | Name | Phone |')
    expect(doc.sections[0]!.text).toContain('| ASC | Michael T. Chen | 330-555-0101 |')
    expect(doc.sections[1]!.text).toContain('| FIDS | IT | 2 |')
  })
})

describe('Markdown, text and HTML parsers', () => {
  it('reads markdown headings and keeps the first H1 as the title', async () => {
    const doc = await parseFile('reference/ncia/terminal-incident-response-plan-TIRP.md')
    expect(doc.title).toMatch(/\(TIRP\)$/)
    expect(paths(doc, 'TIRP')).toContain(
      'TIRP › Section 13 › 13.6 Scenario C: FIDS / BHS System Failure',
    )
  })

  it('finds headings in plain text by pattern and ALL CAPS', async () => {
    const p = join(dir, 'notes.txt')
    writeFileSync(
      p,
      'Hot Wash Notes\n\nPART II\n\nANNEX A: CONTACTS\n\nCall the AOC first.\nThen the\nDuty Manager.\n\nA.1 Escalation\n\nEscalate after 15 minutes.\n',
    )
    const doc = await parseFile(p)
    expect(doc.title).toBe('Hot Wash Notes')
    expect(paths(doc, 'HW')).toEqual([
      'HW › Part II › Annex A',
      'HW › Part II › Annex A › A.1 Escalation',
    ])
    expect(doc.sections[0]!.text).toBe('Call the AOC first. Then the Duty Manager.')
  })

  it('parses HTML headings, lists and tables and ignores scripts', async () => {
    const p = join(dir, 'page.html')
    writeFileSync(
      p,
      '<html><head><title>Ops Page</title><script>alert(1)</script></head><body><h2>SECTION 4: OPS</h2><p>Open the EOC &amp; brief.</p><ul><li>One</li><li>Two</li></ul><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table></body></html>',
    )
    const doc = await parseFile(p)
    expect(doc.title).toBe('Ops Page')
    expect(paths(doc, 'OPS')).toEqual(['OPS › Section 4'])
    expect(doc.sections[0]!.text).toBe(
      'Open the EOC & brief.\n\n- One\n\n- Two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |',
    )
    expect(allText(doc)).not.toContain('alert')
  })
})

describe('scanned PDF OCR fallback', () => {
  const scannedPage = (n: number, topic: string): PdfTextLine[] => [
    { text: `SECTION ${n}: ${topic.toUpperCase()}`, size: 18, bold: true },
    { text: `The duty manager confirms the ${topic} checklist`, size: 11, spaceBefore: 1 },
    { text: 'and reports status to the operations center.', size: 11 },
  ]
  const TOPICS = ['terminal evacuation', 'baggage system outage', 'public information']

  it('OCRs every image-only page and keeps page numbers', async () => {
    const file = join(dir, 'scanned.pdf')
    writeFileSync(
      file,
      buildPdf(TOPICS.map((t, i) => ({ lines: [], scan: scanImage(scannedPage(i + 1, t)) }))),
    )
    const doc = await parseFile(file, 'scanned.pdf')
    expect(doc.pages).toBe(3)
    expect(doc.sections.map((s) => s.page)).toEqual([1, 2, 3])
    const text = allText(doc).toLowerCase()
    for (const t of TOPICS) expect(text).toContain(`${t} checklist`)
    expect(doc.sections[1]!.headingPath[0]).toMatch(/SECTION 2: BAGGAGE SYSTEM OUTAGE/)
    expect(paths(doc, 'SCAN')[1]).toBe('SCAN › Section 2')
  }, 120_000)

  it('OCRs only the pages without a text layer in a mixed PDF', async () => {
    const file = join(dir, 'mixed.pdf')
    writeFileSync(
      file,
      buildPdf([
        { lines: scannedPage(1, 'terminal evacuation') },
        { lines: [], scan: scanImage(scannedPage(2, 'baggage system outage')) },
        // A text layer plus a raster stamp: the text layer wins, the image is not OCR'd.
        {
          lines: scannedPage(3, 'public information'),
          scan: scanImage([{ text: 'RASTER ONLY STAMP', size: 30 }]),
        },
      ]),
    )
    const doc = await parseFile(file, 'mixed.pdf')
    expect(doc.sections.map((s) => s.page)).toEqual([1, 2, 3])
    const text = allText(doc).toLowerCase()
    expect(text).toContain('baggage system outage checklist')
    expect(text).not.toContain('raster only stamp')
  }, 120_000)
})

describe('image OCR', () => {
  it('reads text from a PNG with the bundled language data (no network)', async () => {
    const doc = await parseFile(OCR_SAMPLE, 'ocr-sample.png')
    expect(doc.pages).toBe(1)
    const text = allText(doc)
    expect(text).toMatch(/manual baggage sorting/i)
    expect(paths(doc, 'IMG').some((p) => /13\.6 Scenario C/.test(p))).toBe(true)
  }, 60_000)
})

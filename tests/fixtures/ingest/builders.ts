// Builds small, deterministic fixture files for the ingest tests (PDF, DOCX, PPTX, XLSX), so
// no binary blobs need to live in the repo. ocr-sample.png is the one committed binary.
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import { deflateSync } from 'node:zlib'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx'

export const OCR_SAMPLE = join(import.meta.dirname, 'ocr-sample.png')

export interface PdfTextLine {
  text: string
  size: number
  bold?: boolean
  /** Extra space before the line, in multiples of its size (paragraph break ≈ 1). */
  spaceBefore?: number
}

export interface PdfPageSpec {
  lines: PdfTextLine[]
  header?: string
  footer?: string
  /** Full-page raster (a "scanned" page): deflated 8-bit RGB pixels. */
  scan?: ScanImage
}

export interface ScanImage {
  width: number
  height: number
  deflatedRgb: Buffer
}

const pdfEscape = (s: string) => s.replace(/[\\()]/g, (c) => '\\' + c)

function pageStream(page: PdfPageSpec): string {
  let y = 740
  let s = page.scan ? 'q 612 0 0 792 0 0 cm /Im1 Do Q\n' : ''
  s += 'BT\n'
  const put = (font: string, size: number, x: number, yy: number, text: string) => {
    s += `/${font} ${size} Tf 1 0 0 1 ${x} ${yy.toFixed(1)} Tm (${pdfEscape(text)}) Tj\n`
  }
  if (page.header) put('F1', 8, 72, 770, page.header)
  for (const line of page.lines) {
    y -= line.size * (1.25 + (line.spaceBefore ?? 0))
    put(line.bold ? 'F2' : 'F1', line.size, 72, y, line.text)
  }
  if (page.footer) put('F1', 8, 72, 30, page.footer)
  return s + 'ET'
}

/** Minimal valid PDF with Helvetica / Helvetica-Bold text (uncompressed, hand-built xref). */
export function buildPdf(pages: PdfPageSpec[], info: { title?: string } = {}): Buffer {
  const objects: string[] = []
  const add = (body: string) => objects.push(body)
  add('') // 1 catalog
  add('') // 2 pages
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>') // 3
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>') // 4
  const kids: number[] = []
  for (const page of pages) {
    const stream = pageStream(page)
    const content = add(
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    )
    const image = page.scan
      ? add(
          `<< /Type /XObject /Subtype /Image /Width ${page.scan.width} /Height ${page.scan.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${page.scan.deflatedRgb.length} >>\nstream\n${page.scan.deflatedRgb.toString('latin1')}\nendstream`,
        )
      : undefined
    const xobject = image ? ` /XObject << /Im1 ${image} 0 R >>` : ''
    kids.push(
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobject} >> /Contents ${content} 0 R >>`,
      ),
    )
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
  const infoRef = info.title ? add(`<< /Title (${pdfEscape(info.title)}) >>`) : undefined
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${infoRef ? ` /Info ${infoRef} 0 R` : ''} >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

interface NapiCanvas {
  createCanvas(
    w: number,
    h: number,
  ): {
    getContext(kind: '2d'): {
      fillStyle: string
      font: string
      fillRect(x: number, y: number, w: number, h: number): void
      fillText(t: string, x: number, y: number): void
      getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray }
    }
  }
}

/** @napi-rs/canvas is pdf.js's optional Node canvas; resolve it the way pdf.js does. */
function napiCanvas(): NapiCanvas {
  const fromPdfjs = createRequire(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
  return fromPdfjs('@napi-rs/canvas') as NapiCanvas
}

/**
 * Rasterize text lines onto a white US Letter page at 2× (144 DPI), the way a scanner would
 * hand it over: pixels only, no text layer. Sizes are in points.
 */
export function scanImage(lines: PdfTextLine[]): ScanImage {
  const k = 2
  const width = 612 * k
  const height = 792 * k
  const ctx = napiCanvas().createCanvas(width, height).getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#111111'
  let y = 72
  for (const line of lines) {
    y += line.size * (1.25 + (line.spaceBefore ?? 0))
    ctx.font = `${line.bold ? 'bold ' : ''}${line.size * k}px Helvetica, Arial, sans-serif`
    ctx.fillText(line.text, 72 * k, y * k)
  }
  const rgba = ctx.getImageData(0, 0, width, height).data
  const rgb = Buffer.alloc(width * height * 3)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i]!
    rgb[j + 1] = rgba[i + 1]!
    rgb[j + 2] = rgba[i + 2]!
  }
  return { width, height, deflatedRgb: deflateSync(rgb) }
}

const LOREM =
  'The Airport Operations Center coordinates the initial response and notifies the Duty Manager. ' +
  'Terminal staff follow the checklist and report status every fifteen minutes. '

/** A plan-like PDF: title, SECTION / numbered headings, body paragraphs, running header/footer. */
export function planPdfPages(sectionCount: number, bodyLinesPerSubsection = 6): PdfPageSpec[] {
  const pages: PdfPageSpec[] = []
  const footer = (n: number) => `Page ${n}`
  const header = 'NCIA Terminal Incident Response Plan · Revision 1.0'
  for (let s = 1; s <= sectionCount; s++) {
    const lines: PdfTextLine[] = []
    if (s === 1)
      lines.push({ text: 'Terminal Incident Response Plan (TIRP)', size: 22, bold: true })
    lines.push({ text: `SECTION ${s}: INCIDENT TYPE ${s}`, size: 14, bold: true, spaceBefore: 1 })
    for (let sub = 1; sub <= 3; sub++) {
      lines.push({
        text: `${s}.${sub} Procedures for case ${sub}`,
        size: 12,
        bold: true,
        spaceBefore: 0.8,
      })
      for (let l = 0; l < bodyLinesPerSubsection; l++) {
        lines.push({
          text: `${LOREM.slice(0, 90)} line ${l + 1}.`,
          size: 10,
          spaceBefore: l === 3 ? 1 : 0,
        })
      }
    }
    pages.push({ lines, header, footer: footer(s) })
  }
  return pages
}

export async function buildDocx(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Airport Emergency Plan (AEP)', heading: HeadingLevel.TITLE }),
          new Paragraph({
            text: 'PART II: HAZARD-SPECIFIC APPENDICES',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            text: 'APPENDIX 6: CYBER-PHYSICAL INCIDENTS',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: '6.2 Critical Systems & Impact', heading: HeadingLevel.HEADING_3 }),
          new Paragraph({
            children: [
              new TextRun({ text: 'FIDS ', bold: true }),
              new TextRun('failure forces manual gate announcements.'),
            ],
          }),
          new Table({
            rows: [
              new TableRow({
                children: ['System', 'Impact'].map(
                  (t) => new TableCell({ children: [new Paragraph(t)] }),
                ),
              }),
              new TableRow({
                children: ['BHS', 'Manual bag sort'].map(
                  (t) => new TableCell({ children: [new Paragraph(t)] }),
                ),
              }),
            ],
          }),
        ],
      },
    ],
  })
  return Packer.toBuffer(doc)
}

const PML =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'

const shape = (paras: string[], ph?: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ''}</p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/>${paras
    .map((t) => `<a:p><a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r></a:p>`)
    .join('')}</p:txBody></p:sp>`

export interface SlideSpec {
  title: string
  body: string[]
  notes?: string
  table?: string[][]
}

const tableFrame = (rows: string[][]) =>
  `<p:graphicFrame><a:graphic><a:graphicData><a:tbl>${rows
    .map(
      (r) =>
        `<a:tr>${r.map((c) => `<a:tc><a:txBody><a:p><a:r><a:t>${c}</a:t></a:r></a:p></a:txBody></a:tc>`).join('')}</a:tr>`,
    )
    .join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`

/** Minimal PPTX: presentation order, title placeholders, body text, a table, speaker notes. */
export async function buildPptx(slides: SlideSpec[], title?: string): Promise<Buffer> {
  const zip = new JSZip()
  const ids = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0"?><p:presentation ${PML}><p:sldIdLst>${ids}</p:sldIdLst></p:presentation>`,
  )
  // Store slides in reverse file order to prove presentation order wins.
  const files = slides.map((_, i) => `slides/slide${slides.length - i}.xml`)
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0"?><Relationships>${files.map((f, i) => `<Relationship Id="rId${i + 1}" Target="${f}"/>`).join('')}</Relationships>`,
  )
  slides.forEach((slide, i) => {
    const file = files[i]!
    const frames = slide.table ? tableFrame(slide.table) : ''
    zip.file(
      `ppt/${file}`,
      `<?xml version="1.0"?><p:sld ${PML}><p:cSld><p:spTree>${shape([slide.title], 'title')}${shape(slide.body)}${frames}</p:spTree></p:cSld></p:sld>`,
    )
    if (slide.notes) {
      const name = file.replace('slides/', '')
      zip.file(
        `ppt/slides/_rels/${name}.rels`,
        `<?xml version="1.0"?><Relationships><Relationship Id="rId9" Target="../notesSlides/notesSlide${i + 1}.xml"/></Relationships>`,
      )
      zip.file(
        `ppt/notesSlides/notesSlide${i + 1}.xml`,
        `<?xml version="1.0"?><p:notes ${PML}><p:cSld><p:spTree>${shape(['img'], 'sldImg')}${shape([slide.notes], 'body')}${shape(['3'], 'sldNum')}</p:spTree></p:cSld></p:notes>`,
      )
    }
  })
  if (title) {
    zip.file(
      'docProps/core.xml',
      `<?xml version="1.0"?><cp:coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></cp:coreProperties>`,
    )
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

export async function buildXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const contacts = wb.addWorksheet('Contacts')
  contacts.addRow(['Role', 'Name', 'Phone'])
  contacts.addRow(['Airport Director', 'Jane R. Doe', '330-555-0100'])
  contacts.addRow([
    'ASC',
    { richText: [{ text: 'Michael ' }, { text: 'T. Chen' }] },
    '330-555-0101',
  ])
  const systems = wb.addWorksheet('Systems')
  systems.addRow(['System', 'Owner', 'Count'])
  systems.addRow(['FIDS', 'IT', { formula: '1+1', result: 2 }])
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** Write every generated fixture into `dir`; returns their paths. */
export async function writeFixtures(dir: string) {
  await fs.mkdir(dir, { recursive: true })
  const write = async (name: string, data: Buffer | string) => {
    const p = join(dir, name)
    await fs.writeFile(p, data)
    return p
  }
  return {
    pdf: await write('plan.pdf', buildPdf(planPdfPages(3))),
    docx: await write('aep.docx', await buildDocx()),
    pptx: await write(
      'briefing.pptx',
      await buildPptx(
        [
          {
            title: 'Exercise Overview',
            body: ['STARTEX 0900', 'Hot Wash at 1130'],
            notes: 'Remind players this is no-fault.',
          },
          {
            title: 'Scenario C: FIDS Failure',
            body: ['Boards go dark at Gate A4'],
            table: [
              ['System', 'Status'],
              ['FIDS', 'Down'],
            ],
          },
        ],
        'Player Briefing',
      ),
    ),
    xlsx: await write('contacts.xlsx', await buildXlsx()),
  }
}

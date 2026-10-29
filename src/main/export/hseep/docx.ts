// Word versions of the HSEEP documents (#420), rendered from the same blocks as the PDFs.
// Headings use Word heading styles so the navigation pane shows the HSEEP sections; fact
// tables, tables and lists are real Word structures; blank details print a fill-in line.
import {
  AlignmentType,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  WidthType,
} from 'docx'
import { buildDocument, markdownBlocks, run, table, titleBlocks, type DocxBlock } from '../docx'
import type { ExportModel } from '../model'
import { DOC_LABELS } from '../page'
import { FILL_IN, type Block, type Fact } from './blocks'
import { HSEEP_EYEBROWS, hseepBlocks, hseepEndNote, type HseepDoc } from './index'

const LEVELS = {
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
} as const

const orBlank = (text: string): string => (text.trim() ? text : FILL_IN)

function factsTable(rows: Fact[]): Table {
  const cell = (text: string, header: boolean) =>
    new TableCell({
      children: [new Paragraph({ children: [run(text, { bold: header })] })],
      ...(header ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E7E4DC' } } : {}),
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
    })
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (r) => new TableRow({ children: [cell(r.label, true), cell(orBlank(r.value), false)] }),
    ),
  })
}

function blockToDocx(b: Block): DocxBlock[] {
  switch (b.kind) {
    case 'heading':
      return [new Paragraph({ heading: LEVELS[b.level], children: [run(b.text)] })]
    case 'para':
      return [
        new Paragraph({
          children: [
            ...(b.label ? [run(`${b.label}: `, { bold: true })] : []),
            run(orBlank(b.text)),
          ],
          spacing: { after: 120 },
        }),
      ]
    case 'note':
      return [
        new Paragraph({ children: [run(b.text, { italics: true })], spacing: { after: 120 } }),
      ]
    case 'list':
      return b.items.map((item, i) =>
        b.ordered
          ? new Paragraph({ children: [run(`${i + 1}. ${item}`)], indent: { left: 360 } })
          : new Paragraph({ children: [run(item)], bullet: { level: 0 } }),
      )
    case 'facts':
      return [factsTable(b.rows), new Paragraph('')]
    case 'table':
      return [
        table(
          b.header,
          b.rows.map((r) => r.map((c) => (b.fillBlanks ? orBlank(c) : c))),
        ),
        new Paragraph(''),
      ]
    case 'markdown':
      return markdownBlocks(b.md, b.baseLevel, true)
  }
}

/** One HSEEP document as a .docx buffer. */
export async function hseepDocx(model: ExportModel, doc: HseepDoc): Promise<Buffer> {
  const label = DOC_LABELS[doc]
  const children: DocxBlock[] = [
    ...titleBlocks(model, HSEEP_EYEBROWS[doc], []),
    ...hseepBlocks(model, doc).flatMap(blockToDocx),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [run(hseepEndNote(doc), { italics: true })],
    }),
  ]
  return Packer.toBuffer(buildDocument(model, label, children))
}

export const explanDocx = (model: ExportModel): Promise<Buffer> => hseepDocx(model, 'explan')
export const sitmanDocx = (
  model: ExportModel,
  edition: 'facilitator' | 'player' = 'facilitator',
): Promise<Buffer> => hseepDocx(model, edition === 'player' ? 'sitman_player' : 'sitman')
export const handbookHseepDocx = (model: ExportModel): Promise<Buffer> =>
  hseepDocx(model, 'handbook_hseep')

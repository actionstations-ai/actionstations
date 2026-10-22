// OCR fallback for PDF pages without a text layer (#60). Pages are rasterized with pdf.js
// (Node canvas factory, @napi-rs/canvas) at ~300 DPI and read with the bundled tesseract data.
// OCR lines become PdfLines with sizes from the line heights, so the same layout heuristics
// find headings in scanned and born-digital pages alike.
import type { ParseOptions } from '../types'
import { withOcrWorker } from './image'
import type { PdfLine } from './pdf-layout'

/** Pages with fewer non-space characters than this are treated as scanned. */
export const MIN_TEXT_CHARS = 16
const TARGET_DPI = 300
const MAX_SIDE_PX = 4200
const MIN_LINE_CONFIDENCE = 40

interface CanvasLike {
  toBuffer(mime: 'image/png'): Buffer
}
interface CanvasFactory {
  create(w: number, h: number): { canvas: CanvasLike; context: unknown }
  destroy(entry: unknown): void
}
interface Viewport {
  width: number
  height: number
}
/** The parts of pdf.js's PDFPageProxy this module uses. */
export interface RenderablePage {
  view: number[]
  getViewport(o: { scale: number }): Viewport
  render(o: { canvas: unknown; viewport: Viewport }): { promise: Promise<void> }
}

interface OcrLine {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
  rowAttributes?: { rowHeight?: number }
}
interface OcrPage {
  blocks: { paragraphs: { lines: OcrLine[] }[] }[] | null
}

export function pageNeedsOcr(lines: PdfLine[]): boolean {
  const chars = lines.reduce((n, l) => n + l.text.replace(/\s/g, '').length, 0)
  return chars < MIN_TEXT_CHARS
}

/** Render scale: ~300 DPI, capped so the longest side stays under MAX_SIDE_PX. */
export function ocrScale(widthPt: number, heightPt: number): number {
  const dpiScale = TARGET_DPI / 72
  return Math.min(dpiScale, MAX_SIDE_PX / Math.max(widthPt, heightPt, 1))
}

export async function renderPagePng(page: RenderablePage, factory: CanvasFactory, scale: number) {
  const viewport = page.getViewport({ scale })
  const entry = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height))
  try {
    await page.render({ canvas: entry.canvas, viewport }).promise
    return entry.canvas.toBuffer('image/png')
  } finally {
    factory.destroy(entry)
  }
}

/** Tesseract lines (pixel boxes, top-down) → PdfLines (points, bottom-up like pdf.js). */
export function ocrLinesToPdfLines(
  ocr: OcrPage,
  page: number,
  pageHeight: number,
  scale: number,
): PdfLine[] {
  const out: PdfLine[] = []
  for (const block of ocr.blocks ?? [])
    for (const para of block.paragraphs)
      for (const line of para.lines) {
        const text = line.text.replace(/\s+/g, ' ').trim()
        if (!text || line.confidence < MIN_LINE_CONFIDENCE || !/[\p{L}\p{N}]/u.test(text)) continue
        const heightPx = line.rowAttributes?.rowHeight || line.bbox.y1 - line.bbox.y0
        out.push({
          page,
          y: pageHeight - line.bbox.y1 / scale,
          pageHeight,
          size: Math.round((heightPx / scale / 1.2) * 2) / 2,
          boldShare: 0,
          text,
        })
      }
  return out
}

export interface ScannedPage {
  pageNumber: number
  page: RenderablePage
  pageHeight: number
}

/** OCR the given pages with one tesseract worker; returns lines in page order. */
export async function ocrPdfPages(
  pages: AsyncIterable<ScannedPage> | Iterable<ScannedPage>,
  factory: CanvasFactory,
  opts: ParseOptions,
): Promise<Map<number, PdfLine[]>> {
  return withOcrWorker(opts, async (worker) => {
    const result = new Map<number, PdfLine[]>()
    for await (const { pageNumber, page, pageHeight } of pages) {
      const width = page.view[2]! - page.view[0]!
      const scale = ocrScale(width, pageHeight)
      const png = await renderPagePng(page, factory, scale)
      const { data } = await worker.recognize(png, {}, { blocks: true, text: false })
      result.set(pageNumber, ocrLinesToPdfLines(data as OcrPage, pageNumber, pageHeight, scale))
    }
    return result
  })
}

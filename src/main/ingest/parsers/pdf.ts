// PDF → positioned text lines (pdfjs-dist legacy build, Node) → layout heuristics.
// Runs inside the ingest worker thread (worker-host.ts); pdfjs uses its in-thread "fake worker".
// Pages without a text layer are rasterized and OCR'd (pdf-ocr.ts, #60).
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { AppError } from '../../lib/errors'
import type { ParsedDocument, ParseOptions } from '../types'
import { layoutToDocument, type PdfLine } from './pdf-layout'
import { ocrPdfPages, pageNeedsOcr, type ScannedPage } from './pdf-ocr'

import type * as PdfJsModule from 'pdfjs-dist/legacy/build/pdf.mjs'

type PdfJs = typeof PdfJsModule
type PdfDocument = Awaited<ReturnType<PdfJs['getDocument']>['promise']>
type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>

interface RawItem {
  str: string
  x: number
  y: number
  size: number
  bold: boolean
}

const BOLD_FONT_RE = /bold|black|heavy|semibold|demi/i

/**
 * pdfjs loads @napi-rs/canvas, which on Linux scans the system font folders on import. Under
 * Electron that scan aborts the whole process (SIGTRAP, #373), so it is switched off there;
 * text extraction and OCR rendering use pdfjs's own standard fonts instead.
 */
export function skipCanvasSystemFonts(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform === 'linux') env.DISABLE_SYSTEM_FONTS_LOAD ??= '1'
}

function standardFontDir(): string {
  const requireFromHere = createRequire(import.meta.url)
  return join(dirname(requireFromHere.resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/'
}

/** Font real names ("Helvetica-Bold") are only resolvable after the operator list loads. */
function fontIsBold(page: PdfPage, fontName: string, cache: Map<string, boolean>): boolean {
  const cached = cache.get(fontName)
  if (cached !== undefined) return cached
  let bold = BOLD_FONT_RE.test(fontName)
  try {
    const font = page.commonObjs.get(fontName) as { name?: string; bold?: boolean } | undefined
    bold = bold || !!font?.bold || BOLD_FONT_RE.test(font?.name ?? '')
  } catch {
    // Unresolved font object: fall back to the id test above.
  }
  cache.set(fontName, bold)
  return bold
}

async function pageItems(page: PdfPage): Promise<RawItem[]> {
  await page.getOperatorList()
  const content = await page.getTextContent()
  const cache = new Map<string, boolean>()
  const items: RawItem[] = []
  for (const item of content.items) {
    if (!('str' in item) || !item.str) continue
    const [a, b, c, d, x, y] = item.transform as number[]
    const size = Math.hypot(c!, d!) || Math.hypot(a!, b!) || item.height
    items.push({ str: item.str, x: x!, y: y!, size, bold: fontIsBold(page, item.fontName, cache) })
  }
  return items
}

/** Group text items sharing a baseline into lines (content order is kept). */
export function itemsToLines(items: RawItem[], page: number, pageHeight: number): PdfLine[] {
  const lines: PdfLine[] = []
  let current: { y: number; parts: RawItem[] } | undefined
  const close = () => {
    if (!current) return
    const text = joinItems(current.parts)
    if (text.trim()) {
      const chars = current.parts.reduce((n, p) => n + p.str.trim().length, 0) || 1
      const boldChars = current.parts.reduce((n, p) => n + (p.bold ? p.str.trim().length : 0), 0)
      const size = current.parts.reduce(
        (m, p) => (p.str.trim().length ? Math.max(m, p.size) : m),
        0,
      )
      lines.push({
        page,
        y: current.y,
        pageHeight,
        size,
        boldShare: boldChars / chars,
        text: text.trim(),
      })
    }
    current = undefined
  }
  for (const item of items) {
    if (current && Math.abs(item.y - current.y) <= Math.max(1, item.size * 0.4))
      current.parts.push(item)
    else {
      close()
      current = { y: item.y, parts: [item] }
    }
  }
  close()
  return lines
}

function joinItems(parts: RawItem[]): string {
  const sorted = [...parts].sort((a, b) => a.x - b.x)
  let out = ''
  let prevEnd = -Infinity
  for (const p of sorted) {
    const approxWidth = p.str.length * p.size * 0.5
    const needsSpace =
      out && !/\s$/.test(out) && !/^\s/.test(p.str) && p.x - prevEnd > p.size * 0.15
    out += (needsSpace ? ' ' : '') + p.str
    prevEnd = p.x + approxWidth
  }
  return out.replace(/\s+/g, ' ')
}

async function metadataTitle(doc: PdfDocument): Promise<string | undefined> {
  try {
    const meta = await doc.getMetadata()
    const title = (meta.info as { Title?: string } | undefined)?.Title?.trim()
    if (!title || /^(untitled|microsoft word -)/i.test(title)) return undefined
    return title
  } catch {
    return undefined
  }
}

/** Text lines per page from the text layer; pages that look scanned are listed separately. */
async function textLayerLines(
  doc: PdfDocument,
  opts: ParseOptions,
): Promise<{ lines: PdfLine[][]; scanned: number[] }> {
  const lines: PdfLine[][] = []
  const scanned: number[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    if (opts.signal?.aborted) throw new AppError('CANCELLED', 'Cancelled')
    const page = await doc.getPage(p)
    const height = page.view[3]! - page.view[1]!
    const pageLines = itemsToLines(await pageItems(page), p, height)
    if (pageNeedsOcr(pageLines)) scanned.push(p)
    lines.push(pageLines)
    page.cleanup()
  }
  return { lines, scanned }
}

async function* scannedPages(doc: PdfDocument, numbers: number[]): AsyncGenerator<ScannedPage> {
  for (const pageNumber of numbers) {
    const page = await doc.getPage(pageNumber)
    try {
      yield { pageNumber, page, pageHeight: page.view[3]! - page.view[1]! }
    } finally {
      page.cleanup()
    }
  }
}

/** Replace the (near-)empty text layer of scanned pages with OCR lines. */
async function withOcr(
  doc: PdfDocument,
  perPage: PdfLine[][],
  scanned: number[],
  opts: ParseOptions,
) {
  if (!scanned.length) return perPage.flat()
  const factory = (doc as unknown as { canvasFactory: Parameters<typeof ocrPdfPages>[1] })
    .canvasFactory
  const ocr = await ocrPdfPages(scannedPages(doc, scanned), factory, opts)
  return perPage.flatMap((lines, i) => ocr.get(i + 1) ?? lines)
}

export async function parsePdf(
  filePath: string,
  fallbackTitle: string,
  opts: ParseOptions = {},
): Promise<ParsedDocument> {
  skipCanvasSystemFonts()
  const pdfjs: PdfJs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(await fs.readFile(filePath))
  const task = pdfjs.getDocument({
    data,
    standardFontDataUrl: standardFontDir(),
    fontExtraProperties: true,
    useSystemFonts: false,
    verbosity: 0,
  })
  const doc = await task.promise
  try {
    const { lines: perPage, scanned } = await textLayerLines(doc, opts)
    const lines = await withOcr(doc, perPage, scanned, opts)
    if (!lines.length) {
      throw new AppError(
        'VALIDATION',
        'No extractable text: this PDF has no text layer and OCR found no readable text.',
      )
    }
    const title = (await metadataTitle(doc)) ?? fallbackTitle
    return layoutToDocument(lines, doc.numPages, title)
  } finally {
    await task.destroy()
  }
}

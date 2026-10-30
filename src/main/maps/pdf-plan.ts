// One page of a PDF as a site-plan image (#500, spec 0436 FR-2): rendered with pdf.js at 200 dpi,
// the long edge capped at 8000 px and the area at 50 megapixels, written as PNG.
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { AppError } from '../lib/errors'
import { renderPagePng, type RenderablePage } from '../ingest/parsers/pdf-ocr'
import { skipCanvasSystemFonts } from '../ingest/parsers/pdf'

export const PLAN_DPI = 200
export const MAX_PLAN_EDGE = 8000
export const MAX_PLAN_AREA = 50_000_000

/** Render scale for a page of `widthPt` x `heightPt` points: 200 dpi within the pixel caps. */
export function planScale(widthPt: number, heightPt: number): number {
  const w = Math.max(widthPt, 1)
  const h = Math.max(heightPt, 1)
  return Math.min(
    PLAN_DPI / 72,
    MAX_PLAN_EDGE / Math.max(w, h),
    Math.sqrt((MAX_PLAN_AREA * 0.98) / (w * h)),
  )
}

const standardFonts = (): string =>
  join(
    dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')),
    'standard_fonts',
  ) + '/'

export interface RenderedPage {
  png: Buffer
  pages: number
}

/** Render page `page` (1-based) of the PDF at `filePath`. */
export async function renderPdfPage(filePath: string, page: number): Promise<RenderedPage> {
  skipCanvasSystemFonts()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(await fs.readFile(filePath))
  const task = pdfjs.getDocument({
    data,
    standardFontDataUrl: standardFonts(),
    useSystemFonts: false,
    verbosity: 0,
  })
  const doc = await task.promise.catch(() => {
    throw new AppError('VALIDATION', 'That file is not a readable PDF')
  })
  try {
    if (page < 1 || page > doc.numPages)
      throw new AppError(
        'VALIDATION',
        `The PDF has ${doc.numPages} page(s); there is no page ${page}`,
      )
    const proxy = await doc.getPage(page)
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = proxy.view
    const scale = planScale(x1 - x0, y1 - y0)
    const factory = (doc as unknown as { canvasFactory: Parameters<typeof renderPagePng>[1] })
      .canvasFactory
    const png = await renderPagePng(proxy as unknown as RenderablePage, factory, scale)
    return { png, pages: doc.numPages }
  } finally {
    await task.destroy()
  }
}

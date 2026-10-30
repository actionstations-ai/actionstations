// PDF site plans (#500): the render scale respects the caps, a page renders to a PNG, the
// original PDF is kept beside plan.png, and a bad page number is refused.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { buildPdf } from '../../../tests/fixtures/ingest/builders'

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0', getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { MAX_PLAN_AREA, MAX_PLAN_EDGE, planScale, renderPdfPage } = await import('./pdf-plan')
const { importSitePlan, imageSize } = await import('./import-plan')

const pdfFile = (pages = 2): string => {
  const dir = mkdtempSync(join(tmpdir(), 'maps-pdf-'))
  const file = join(dir, 'terminal.pdf')
  writeFileSync(
    file,
    buildPdf(
      Array.from({ length: pages }, (_, i) => ({ lines: [{ text: `Level ${i + 1}`, size: 24 }] })),
    ),
  )
  return file
}

describe('planScale', () => {
  it('renders an ordinary page at 200 dpi', () => {
    expect(planScale(612, 792)).toBeCloseTo(200 / 72, 5)
  })
  it('caps the long edge at 8000 px for a large drawing', () => {
    const scale = planScale(3000, 2000)
    expect(3000 * scale).toBeLessThanOrEqual(MAX_PLAN_EDGE)
  })
  it('keeps the area under 50 megapixels for a square page', () => {
    const scale = planScale(2000, 2000)
    expect(2000 * scale * 2000 * scale).toBeLessThanOrEqual(MAX_PLAN_AREA)
  })
})

describe('renderPdfPage', () => {
  it('renders a page to a PNG and reports the page count', async () => {
    const { png, pages } = await renderPdfPage(pdfFile(), 2)
    expect(pages).toBe(2)
    const size = imageSize(png)
    expect(size!.width).toBeGreaterThan(1000)
    expect(size!.height).toBeGreaterThan(size!.width)
  })
  it('refuses a page the PDF does not have', async () => {
    await expect(renderPdfPage(pdfFile(1), 3)).rejects.toThrow(/there is no page 3/)
  })
})

describe('importing a PDF site plan', () => {
  it('writes plan.png and keeps the PDF as source.pdf', async () => {
    const root = mkdtempSync(join(tmpdir(), 'maps-proj-'))
    const done = await importSitePlan(root, { filePath: pdfFile(), title: 'Terminal', page: 1 })
    if (done.layer.kind !== 'site_plan') throw new Error('expected a site plan')
    expect(done.layer.image).toMatch(/^maps\/plan-[a-z0-9]+\/plan\.png$/)
    expect(done.layer.source).toMatch(/^maps\/plan-[a-z0-9]+\/source\.pdf$/)
    expect(done.layer.width).toBeGreaterThan(1000)
    expect(readFileSync(join(root, done.layer.source)).subarray(0, 4).toString()).toBe('%PDF')
  })
})

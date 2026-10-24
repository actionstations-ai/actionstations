// Renders every inject template's preview.json through the real app (templates:list →
// render:preview) into test-results/templates/<type>.png. This is the template authoring
// loop: pnpm build:app && pnpm exec playwright test e2e/templates-preview.spec.ts
// The other tests exercise the render window pool and render:inject in the built app.
import { expect, test, type ElectronApplication } from '@playwright/test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pixelmatch from 'pixelmatch'
import pngjs from 'pngjs'
import { invoker, launch } from './helpers'

const { PNG } = pngjs

interface TemplateInfo {
  type: string
  width: number
  preview: Record<string, unknown>
  /** preview.json per-variant sample data, merged (#331). */
  previewVariants?: Record<string, Record<string, unknown>>
  variants: string[]
}

interface Preview {
  dataUrl: string
  width: number
  height: number
}

const pngBytes = (r: Preview) => Buffer.from(r.dataUrl.split(',')[1]!, 'base64')
/** Width/height straight from the PNG IHDR chunk. */
const pngSize = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)]

/**
 * Concurrent offscreen rasterization can shift a few anti-aliased pixels between windows
 * (measured: up to ~120 of 3.4M at 2x). Allow ≤ 0.01 % — far below anything visible and
 * 10× stricter than the golden tolerance — instead of demanding exact equality.
 */
const maxNoise = (png: Buffer) =>
  Math.ceil(PNG.sync.read(png).width * PNG.sync.read(png).height * 0.0001)

/** Pixels that differ visibly (pixelmatch threshold 0.1, the golden-test setting). */
function visibleDiff(a: Buffer, b: Buffer): number {
  const [x, y] = [PNG.sync.read(a), PNG.sync.read(b)]
  return pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: 0.1 })
}

const TIME_JUMP = JSON.parse(readFileSync('templates/injects/time_jump_card/preview.json', 'utf8'))
  .fields as Record<string, unknown>

test('every template renders its preview to PNG', async () => {
  const out = resolve('test-results/templates')
  mkdirSync(out, { recursive: true })
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    const templates = await invoke<TemplateInfo[]>('templates:list')
    expect(templates.length).toBeGreaterThan(0)
    for (const t of templates) {
      for (const variant of t.variants.length ? t.variants : ['default']) {
        const r = await invoke<Preview>('render:preview', {
          type: t.type,
          fields: t.previewVariants?.[variant] ?? t.preview,
          variant,
          scale: 2,
        })
        expect(r.width, t.type).toBe(t.width)
        expect(r.height, t.type).toBeGreaterThan(20)
        const png = pngBytes(r)
        expect(png.length, t.type).toBeGreaterThan(2000)
        writeFileSync(join(out, `${t.type}${variant === 'default' ? '' : `--${variant}`}.png`), png)
      }
    }
  } finally {
    await app.close()
  }
})

const crashRenderWindows = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const offscreen = BrowserWindow.getAllWindows().filter((w) => w.webContents.isOffscreen())
    for (const w of offscreen) w.webContents.forcefullyCrashRenderer()
    return offscreen.length
  })

test('render pool: mixed zoom levels in parallel stay correct; crashes recover', async () => {
  test.setTimeout(120_000)
  const { app, page } = await launch()
  const invoke = invoker(page)
  const preview = (scale: number) =>
    invoke<Preview>('render:preview', { type: 'time_jump_card', fields: TIME_JUMP, scale })
  try {
    const ref2 = pngBytes(await preview(2))
    const ref1 = pngBytes(await preview(1))
    expect(pngSize(ref2)).toEqual([1632, 2112])
    expect(pngSize(ref1)).toEqual([816, 1056])

    const scales = Array.from({ length: 12 }, (_, i) => (i % 3 === 0 ? 1 : 2))
    const outs = await Promise.all(scales.map(async (s) => pngBytes(await preview(s))))
    // Parallel windows may differ by a few anti-aliased pixels; a wrong zoom would not.
    outs.forEach((b, i) => {
      expect(pngSize(b), `job ${i}`).toEqual(pngSize(scales[i] === 1 ? ref1 : ref2))
      expect(visibleDiff(b, scales[i] === 1 ? ref1 : ref2), `job ${i}`).toBeLessThanOrEqual(
        maxNoise(b),
      )
    })

    // Crash idle warm windows: the next render must get a fresh window.
    expect(await crashRenderWindows(app)).toBeGreaterThan(0)
    expect(visibleDiff(pngBytes(await preview(2)), ref2)).toBeLessThanOrEqual(maxNoise(ref2))

    // Crash windows mid-render: in-flight jobs fail with a clear error, later ones work.
    const inflight = Array.from({ length: 4 }, () => preview(2))
    await new Promise((r) => setTimeout(r, 30))
    await crashRenderWindows(app)
    const settled = await Promise.allSettled(inflight)
    const errors = settled.flatMap((s) => (s.status === 'rejected' ? [String(s.reason)] : []))
    expect(errors.length).toBeGreaterThan(0)
    for (const e of errors) expect(e).toMatch(/Render window crashed/)
    expect(visibleDiff(pngBytes(await preview(2)), ref2)).toBeLessThanOrEqual(maxNoise(ref2))
    const windows = await app.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().filter((w) => w.webContents.isOffscreen()).length,
    )
    expect(windows).toBeLessThanOrEqual(2)
  } finally {
    await app.close()
  }
})

test('render:inject writes PNG + PDF into the project and records the assets', async () => {
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-proj-'))
    const project = await invoke<{ path: string }>('project:create', { parentDir, name: 'NCIA' })
    const scenario = await invoke<{ id: string }>('scenarios:create-empty', {
      projectPath: project.path,
      title: 'Flight to Nowhere',
    })
    const inject = {
      id: 'inj-05',
      mselRowId: 'I-05',
      type: 'time_jump_card',
      title: 'Time jump',
      fields: TIME_JUMP,
    }
    const injectsDir = join(project.path, 'scenarios', scenario.id, 'injects')
    writeFileSync(join(injectsDir, 'inj-05.json'), JSON.stringify(inject))
    const req = { projectPath: project.path, scenarioId: scenario.id, injectId: 'inj-05' }
    await invoke('render:inject', req)
    const assets = await invoke<{ path: string; kind: string; role: string }[]>(
      'render:inject',
      req,
    )
    expect(assets.map((a) => `${a.kind}:${a.role}`)).toEqual(['image:rendered', 'pdf:rendered'])
    for (const a of assets) expect(existsSync(join(project.path, a.path)), a.path).toBe(true)
    const png = readFileSync(join(project.path, assets[0]!.path))
    expect(pngSize(png)).toEqual([1632, 2112])
    const pdf = readFileSync(join(project.path, assets[1]!.path))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    const saved = JSON.parse(readFileSync(join(injectsDir, 'inj-05.json'), 'utf8'))
    expect(saved.assets).toHaveLength(2)
    // The second render replaced the first one's files.
    const media = join(project.path, 'scenarios', scenario.id, 'media', 'inj-05')
    expect(readdirSync(media).sort()).toEqual(assets.map((a) => a.path.split('/').pop()).sort())
  } finally {
    await app.close()
  }
})

test('Templates gallery shows rendered previews and a detail view', async () => {
  const { app, page } = await launch()
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Templates' })
      .click()
    await expect(page.getByRole('heading', { name: 'Templates', level: 1 })).toBeVisible()
    const card = page.getByRole('button', { name: /Time jump card/ })
    await expect(card.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)
    await page.screenshot({ path: '.tmp/gallery-grid.png' })
    await card.click()
    const detail = page.getByRole('region', { name: 'Time jump card' })
    await expect(detail.getByRole('rowheader', { name: /newTime/ })).toBeVisible()
    await expect(detail.getByRole('img', { name: /preview \(default\)/ })).toBeVisible()
    await page.screenshot({ path: '.tmp/gallery-detail.png' })
  } finally {
    await app.close()
  }
})

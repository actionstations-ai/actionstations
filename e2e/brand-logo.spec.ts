// Project logo (#217) through the built app: set a logo on an example project, then render
// the four templates with a logo slot and export the exercise plan. Renders and the cover
// are written to .tmp/brand-logo-shots/ for review.
import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pngjs from 'pngjs'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { invoker, launch } from './helpers'

const { PNG } = pngjs
const SHOTS = resolve('.tmp/brand-logo-shots')

/** A plain two-colour mark: a disc and three bars, transparent background (no text). */
function sampleLogo(): Buffer {
  const w = 360
  const h = 120
  const png = new PNG({ width: w, height: h })
  const put = (x: number, y: number, rgb: [number, number, number]) => {
    const i = (y * w + x) * 4
    png.data[i] = rgb[0]
    png.data[i + 1] = rgb[1]
    png.data[i + 2] = rgb[2]
    png.data[i + 3] = 255
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if ((x - 60) ** 2 + (y - 60) ** 2 < 52 ** 2) put(x, y, [16, 74, 110])
      const bar = x >= 132 && x < 340
      if (bar && y >= 22 && y < 50) put(x, y, [16, 74, 110])
      if (bar && x < 300 && y >= 62 && y < 78) put(x, y, [40, 150, 140])
      if (bar && x < 260 && y >= 88 && y < 100) put(x, y, [40, 150, 140])
    }
  return PNG.sync.write(png)
}

interface Job {
  status: string
  error?: string
  result?: { folder: string; files: string[] }
}

test('a project logo appears in memo, press release, SITREP, own letters and the cover', async () => {
  test.setTimeout(6 * 60_000)
  mkdirSync(SHOTS, { recursive: true })
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-logo-e2e-'))
    const opened = await invoke<{ path: string; project: { scenarios: { id: string }[] } }>(
      'examples:open',
      { slug: 'city-water', parentDir },
    )
    const projectPath = opened.path
    const logoFile = join(parentDir, 'county-logo.png')
    writeFileSync(logoFile, sampleLogo())
    const set = await invoke<{ project: { brand: { logoPath?: string } } }>('project:set-logo', {
      path: projectPath,
      sourcePath: logoFile,
    })
    expect(set.project.brand.logoPath).toMatch(/^brand\/logo-[0-9a-f]{12}\.png$/)

    const templates =
      await invoke<{ type: string; preview: Record<string, unknown> }[]>('templates:list')
    const previewOf = (type: string) => templates.find((t) => t.type === type)!.preview
    const letter = previewOf('official_letter') as { letterhead: Record<string, unknown> }
    const cases: [string, Record<string, unknown>, string?][] = [
      ['memo', previewOf('memo')],
      ['press_release', previewOf('press_release')],
      ['sitrep', previewOf('sitrep')],
      [
        'official_letter',
        { ...letter, letterhead: { ...letter.letterhead, fromProject: true } },
        'corporate',
      ],
    ]
    for (const [type, fields, variant] of cases) {
      const render = async (withProject: boolean) =>
        (
          await invoke<{ dataUrl: string }>('render:preview', {
            type,
            fields,
            ...(variant ? { variant } : {}),
            ...(withProject ? { projectPath } : {}),
            scale: 1,
          })
        ).dataUrl
      const [plain, branded] = [await render(false), await render(true)]
      expect(branded, `${type} renders differently with the logo`).not.toBe(plain)
      writeFileSync(join(SHOTS, `${type}.png`), Buffer.from(branded.split(',')[1]!, 'base64'))
    }

    const outDir = mkdtempSync(join(tmpdir(), 'ttx-logo-export-'))
    const { jobId } = await invoke<{ jobId: string }>('export:run', {
      projectPath,
      scenarioId: opened.project.scenarios[0]!.id,
      outDir,
      targets: ['exercise_plan_pdf'],
    })
    await expect
      .poll(async () => (await invoke<Job>('jobs:get', { jobId })).status, { timeout: 240_000 })
      .toMatch(/done|error|cancelled/)
    const job = await invoke<Job>('jobs:get', { jobId })
    expect(job.status, job.error).toBe('done')
    const pdfFile = job.result!.files.find((f) => f.endsWith('-Exercise-Plan.pdf'))!
    const pdfPath = pdfFile.startsWith('/') ? pdfFile : join(job.result!.folder, pdfFile)
    const bytes = readFileSync(pdfPath)
    writeFileSync(join(SHOTS, 'exercise-plan.pdf'), bytes)
    const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise
    const ops = await (await doc.getPage(1)).getOperatorList()
    expect(ops.fnArray, 'the cover page paints an image').toContain(OPS.paintImageXObject)
  } finally {
    await app.close()
  }
})

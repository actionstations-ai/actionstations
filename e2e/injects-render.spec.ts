// Opt-in companion of tests/live/injects.live.test.ts: template rendering needs a real
// Electron main process (the live Vitest run mocks electron), so this spec opens the project
// the live run left behind, renders every inject through render:inject (composites included)
// and copies downscaled PNGs into the sample-run folder.
//
//   LIVE_PROJECT=<project dir> LIVE_SCENARIO=<scenario id> [LIVE_RESOURCES=<dir>] \
//     [LIVE_OUT=tests/fixtures/injects/sample-run] pnpm exec playwright test e2e/injects-render.spec.ts
import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { shrinkPngToFit } from '../tests/fixtures/injects/png'
import { invoker, launch } from './helpers'

const PROJECT = process.env.LIVE_PROJECT
const SCENARIO = process.env.LIVE_SCENARIO
const OUT_DIR = resolve(process.env.LIVE_OUT ?? 'tests/fixtures/injects/sample-run')
/** Rows whose PNGs are copied into the fixture folder (the fixture stays under 4 MB). */
const COPY_ROWS = new Set(
  (process.env.LIVE_MEDIA ?? 'I-04,I-06,I-06b,I-10,I-05b,I-12,I-09')
    .split(',')
    .map((s) => s.trim()),
)
const MAX_PNG_BYTES = 220 * 1024

interface Asset {
  id: string
  kind: string
  role: string
  path: string
  width?: number
  height?: number
}
interface Inject {
  id: string
  mselRowId: string
  type: string
  assets: Asset[]
}

test.skip(!PROJECT || !SCENARIO, 'set LIVE_PROJECT and LIVE_SCENARIO (from a live inject run)')

test('renders every inject of the live scenario through render:inject', async () => {
  test.setTimeout(20 * 60 * 1000)
  const env: Record<string, string> = {}
  if (process.env.LIVE_RESOURCES) env.TTX_RESOURCES = resolve(process.env.LIVE_RESOURCES)
  const { app, page } = await launch(env)
  const invoke = invoker(page)
  await invoke('project:open', { path: PROJECT })
  const injects = await invoke<Inject[]>('injects:list', {
    projectPath: PROJECT,
    scenarioId: SCENARIO,
  })
  expect(injects.length).toBeGreaterThan(0)
  const report: Record<string, unknown>[] = []
  for (const inject of injects) {
    const t0 = Date.now()
    try {
      const assets = await invoke<Asset[]>('render:inject', {
        projectPath: PROJECT,
        scenarioId: SCENARIO,
        injectId: inject.id,
      })
      const rendered = assets.filter((a) => a.role === 'rendered' || a.role === 'composite')
      const files: string[] = []
      for (const a of rendered) {
        const src = join(PROJECT!, a.path)
        const dir = join(OUT_DIR, 'media', inject.mselRowId)
        const name = `${a.role}-${a.path.split('/').pop()}`
        if (a.kind === 'image' && COPY_ROWS.has(inject.mselRowId)) {
          mkdirSync(dir, { recursive: true })
          writeFileSync(join(dir, name), shrinkPngToFit(readFileSync(src), MAX_PNG_BYTES))
        }
        files.push(
          `${name} (${Math.round(statSync(src).size / 1024)} KB @2x, ${a.width}×${a.height})`,
        )
      }
      report.push({
        row: inject.mselRowId,
        type: inject.type,
        ms: Date.now() - t0,
        assets: rendered.length,
        files,
      })
      console.log(
        `${inject.mselRowId} ${inject.type}: ${rendered.map((a) => a.role).join('+')} in ${Date.now() - t0} ms`,
      )
    } catch (err) {
      report.push({
        row: inject.mselRowId,
        type: inject.type,
        ms: Date.now() - t0,
        error: (err as Error).message,
      })
      console.log(`${inject.mselRowId} ${inject.type}: FAILED ${(err as Error).message}`)
    }
  }
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'render-report.json'), JSON.stringify(report, null, 2))
  await app.close()
  const failed = report.filter((r) => r.error)
  // Types without a template cannot render, and a page the text stage flagged as not matching
  // its schema (INJECT_FIELDS_INVALID) is reported, not blocking; everything else must render.
  const blocking = failed.filter(
    (r) => !/No template for inject type|fields do not match/.test(String(r.error)),
  )
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([])
})

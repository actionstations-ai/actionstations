// Smoke test for the packaged app (release/<version>/…), run by scripts/package-smoke.mjs:
//   pnpm package:smoke            (after `pnpm build` or `pnpm build:check`)
// It catches what only packaging can break: files missing from app.asar, native modules or
// data that must be asar-unpacked (better-sqlite3, sqlite-vec, tesseract, pdfjs fonts), and
// fuses that are off or that break the app.
//
// Playwright's _electron.launch() needs the Node inspector (--inspect), which the
// EnableNodeCliInspectArguments fuse switches off in packaged builds. So the app is started
// as a plain process with Chromium's --remote-debugging-port and driven over CDP; the
// renderer's window.ttx bridge is all the test needs. Skipped unless TTX_PACKAGED_APP points
// at the packaged executable.
import { chromium, expect, test, type Browser, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pngjs from 'pngjs'
import { compareWithGolden, GOLDEN_DEFAULTS, goldenPath } from '../src/main/render/golden'
import { OCR_SAMPLE, buildDocx, buildPdf, planPdfPages } from '../tests/fixtures/ingest/builders'
import { invoker } from './helpers'

const EXE = process.env.TTX_PACKAGED_APP ?? ''
const STARTUP_MS = 30_000

interface Running {
  child: ChildProcess
  output: () => string
  exited: Promise<number | null>
}

interface Connected extends Running {
  browser: Browser
  page: Page
}

function start(args: string[], env: Record<string, string> = {}): Running {
  const userData = mkdtempSync(join(tmpdir(), 'ttx-packaged-'))
  // Fresh installs open the setup wizard; this smoke test starts on the Projects screen.
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingComplete: true }))
  const child = spawn(EXE, args, {
    env: { ...process.env, TTX_USER_DATA: userData, TTX_HEADLESS: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  child.stdout!.on('data', (d: Buffer) => (out += d.toString()))
  child.stderr!.on('data', (d: Buffer) => (out += d.toString()))
  const exited = new Promise<number | null>((r) => child.once('exit', (code) => r(code)))
  return { child, output: () => out, exited }
}

async function waitFor<T>(probe: () => T | undefined, what: string, ms = STARTUP_MS): Promise<T> {
  const until = Date.now() + ms
  for (;;) {
    const v = probe()
    if (v !== undefined) return v
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 100))
  }
}

async function stop(run: Running): Promise<void> {
  if (run.child.exitCode !== null) return
  run.child.kill('SIGTERM')
  const timer = setTimeout(() => run.child.kill('SIGKILL'), 5_000)
  await run.exited
  clearTimeout(timer)
}

/** Start the packaged app with CDP and attach to its main window. */
async function launchPackaged(env: Record<string, string> = {}): Promise<Connected> {
  const run = start(['--remote-debugging-port=0'], env)
  const ws = await waitFor(
    () => /DevTools listening on (ws:\/\/\S+)/.exec(run.output())?.[1],
    'the DevTools endpoint',
  )
  const browser = await chromium.connectOverCDP(ws)
  const page = await waitFor(
    () =>
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().includes('/renderer/index.html')),
    'the main window',
  )
  await page.waitForLoadState('domcontentloaded')
  return { ...run, browser, page }
}

async function close(app: Connected): Promise<void> {
  await app.browser.close().catch(() => undefined)
  await stop(app)
}

interface Doc {
  id: string
  filename: string
  status: string
  chunkCount: number
  error?: string
}
interface Hit {
  documentTitle: string
  headingPath: string
}
interface TemplateInfo {
  type: string
  preview: Record<string, unknown>
  variants: string[]
}

test.describe('packaged app', () => {
  test.skip(!EXE, 'TTX_PACKAGED_APP is not set (run scripts/package-smoke.mjs)')
  test.beforeAll(() => {
    if (!existsSync(EXE)) throw new Error(`Packaged executable not found: ${EXE}`)
  })

  test('starts, ingests PDF/DOCX/PNG (OCR) into sqlite-vec and serves ttx-media', async () => {
    test.setTimeout(180_000)
    const app = await launchPackaged()
    const invoke = invoker(app.page)
    try {
      await expect(app.page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
      const info = await invoke<{ electron: string }>('app:info')
      expect(info.electron).toBe('45.0.0')

      const parentDir = mkdtempSync(join(tmpdir(), 'ttx-packaged-proj-'))
      const { path: projectPath } = await invoke<{ path: string }>('project:create', {
        parentDir,
        name: 'Packaged Smoke',
      })
      const src = mkdtempSync(join(tmpdir(), 'ttx-packaged-src-'))
      const pdf = join(src, 'tirp.pdf')
      const docx = join(src, 'aep.docx')
      writeFileSync(pdf, buildPdf(planPdfPages(3)))
      writeFileSync(docx, await buildDocx())
      await invoke('documents:import', { projectPath, filePaths: [pdf, docx, OCR_SAMPLE] })

      await expect
        .poll(
          async () => (await invoke<Doc[]>('documents:list', { projectPath })).map((d) => d.status),
          { timeout: 120_000 },
        )
        .toEqual(['ok', 'ok', 'ok'])
      const docs = await invoke<Doc[]>('documents:list', { projectPath })
      for (const d of docs) expect(d.chunkCount, d.filename).toBeGreaterThan(0)

      const top = async (query: string) =>
        (await invoke<Hit[]>('retrieve:search', { projectPath, query, k: 3 }))[0]
      expect((await top('Procedures for case 2'))?.headingPath).toMatch(
        /› \d\.2 Procedures for case 2$/,
      )
      expect((await top('FIDS failure manual gate announcements'))?.headingPath).toMatch(
        /Appendix 6|6\.2/i,
      )
      expect((await top('manual baggage sorting'))?.headingPath).toMatch(/13\.6 Scenario C/)

      const png = docs.find((d) => d.filename.endsWith('.png'))!
      const media = `ttx-media://project/${encodeURIComponent(projectPath)}/documents/${png.id}/original.png`
      // The renderer shows project media through <img src="ttx-media://…">.
      const shown = await app.page.evaluate(async (url) => {
        interface Img {
          src: string
          naturalWidth: number
          naturalHeight: number
          decode(): Promise<void>
        }
        const img = new (globalThis as unknown as { Image: new () => Img }).Image()
        img.src = url
        await img.decode()
        return { width: img.naturalWidth, height: img.naturalHeight }
      }, media)
      const { PNG } = pngjs
      const sample = PNG.sync.read(readFileSync(OCR_SAMPLE))
      expect(shown).toEqual({ width: sample.width, height: sample.height })
      await app.page.screenshot({ path: 'test-results/packaged-projects.png' })
    } finally {
      await close(app)
    }
  })

  test('renders every template preview to match its golden', async () => {
    test.setTimeout(240_000)
    const app = await launchPackaged()
    const invoke = invoker(app.page)
    const failures: string[] = []
    try {
      const templates = await invoke<TemplateInfo[]>('templates:list')
      expect(templates.length).toBeGreaterThan(0)
      for (const t of templates) {
        for (const variant of t.variants.length ? t.variants : ['default']) {
          const r = await invoke<{ dataUrl: string }>('render:preview', {
            type: t.type,
            fields: t.preview,
            variant,
            scale: 2,
          })
          const actual = Buffer.from(r.dataUrl.split(',')[1]!, 'base64')
          const result = compareWithGolden(
            actual,
            goldenPath(resolve('templates/injects'), t.type, variant),
            `${t.type}--${variant}`,
            { ...GOLDEN_DEFAULTS, diffDir: resolve('.tmp/packaged-golden-diff'), update: false },
          )
          if (result.status !== 'match') failures.push(`${t.type}--${variant}: ${result.status}`)
        }
      }
      expect(failures).toEqual([])
    } finally {
      await close(app)
    }
  })

  test('fuses: ELECTRON_RUN_AS_NODE, NODE_OPTIONS and --inspect are ignored', async () => {
    test.setTimeout(90_000)
    const marker = join(mkdtempSync(join(tmpdir(), 'ttx-fuse-')), 'node-options-ran')
    const probe = join(tmpdir(), `ttx-fuse-probe-${process.pid}.cjs`)
    writeFileSync(probe, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`)

    // RunAsNode off: the binary starts the app instead of running `-e` as Node.
    const asNode = start(['-e', 'console.log("RUN_AS_NODE_ACTIVE"); process.exit(0)'], {
      ELECTRON_RUN_AS_NODE: '1',
    })
    await new Promise((r) => setTimeout(r, 6_000))
    const asNodeOutput = asNode.output()
    const stillRunning = asNode.child.exitCode === null
    await stop(asNode)
    expect(asNodeOutput).not.toContain('RUN_AS_NODE_ACTIVE')
    expect(stillRunning, 'the app (not Node) should be running').toBe(true)

    // NodeCliInspectArguments off: --inspect starts no inspector. NODE_OPTIONS --require must
    // not run either (the fuse itself is checked statically by scripts/package-smoke.mjs;
    // Electron also filters most NODE_OPTIONS in packaged apps, so this is defense in depth).
    const app = await launchPackaged({ NODE_OPTIONS: `--require ${probe}` })
    const run = start(['--inspect=0', '--remote-debugging-port=0'])
    try {
      await expect(app.page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
      await waitFor(() => (/DevTools listening/.test(run.output()) ? true : undefined), 'CDP')
      await new Promise((r) => setTimeout(r, 2_000))
      expect(existsSync(marker), 'NODE_OPTIONS --require must not run').toBe(false)
      expect(run.output()).not.toMatch(/Debugger listening/)
    } finally {
      await close(app)
      await stop(run)
    }
  })
})

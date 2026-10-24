// Smoke test for the packaged app (release/<version>/…), run by scripts/package-smoke.mjs:
//   pnpm package:smoke            (after `pnpm build` or `pnpm build:check`)
// It catches what only packaging can break: files missing from app.asar, native modules or
// data that must be asar-unpacked (better-sqlite3, sqlite-vec, tesseract, pdfjs fonts), and
// fuses that are off or that break the app (GrantFileProtocolExtraPrivileges is off, so the
// renderer must load from app://bundle/, ADR-0013).
//
// Playwright's _electron.launch() needs the Node inspector (--inspect), which the
// EnableNodeCliInspectArguments fuse switches off in packaged builds. So the app is started
// as a plain process with Chromium's --remote-debugging-port and driven over CDP; the
// renderer's window.ttx bridge is all the test needs. Skipped unless TTX_PACKAGED_APP points
// at the packaged executable.
import { chromium, expect, test, type Browser, type Page } from '@playwright/test'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pngjs from 'pngjs'
import { compareWithGolden, GOLDEN_DEFAULTS, goldenPath } from '../src/main/render/golden'
import { OCR_SAMPLE, buildDocx, buildPdf, planPdfPages } from '../tests/fixtures/ingest/builders'
import { invoker } from './helpers'

const EXE = process.env.TTX_PACKAGED_APP ?? ''
/** The renderer is served from a custom protocol so file:// needs no extra privileges (#117). */
const APP_INDEX = 'app://bundle/index.html'
const SCENARIO_3 = resolve('tests/fixtures/scenarios/scenario-3.json')
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

/** Every app process this spec started and that has not exited yet. */
const live = new Set<Running>()

/** Last resort if the runner dies mid-test: no packaged app may outlive it. */
function killAllNow(): void {
  for (const run of live) run.child.kill('SIGKILL')
}
process.once('exit', killAllNow)
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    killAllNow()
    process.exit(130)
  })

/** PIDs of processes whose command line contains the packaged executable path. */
function processesOf(exe: string): string[] {
  const r = spawnSync('pgrep', ['-f', '--', exe], { encoding: 'utf8' })
  const self = [String(process.pid), String(process.ppid)]
  return r.stdout.split('\n').filter((pid) => pid && !self.includes(pid))
}

function start(args: string[], env: Record<string, string> = {}): Running {
  const userData = mkdtempSync(join(tmpdir(), 'ttx-packaged-'))
  // Fresh installs open the setup wizard; this smoke test starts on the Projects screen.
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingComplete: true }))
  const child = spawn(EXE, args, {
    env: { ...process.env, TTX_USER_DATA: userData, TTX_HEADLESS: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })
  let out = ''
  child.stdout!.on('data', (d: Buffer) => (out += d.toString()))
  child.stderr!.on('data', (d: Buffer) => (out += d.toString()))
  const exited = new Promise<number | null>((r) => child.once('exit', (code) => r(code)))
  const run = { child, output: () => out, exited }
  live.add(run)
  void exited.then(() => live.delete(run))
  return run
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

/** SIGTERM, then SIGKILL after 5 s; resolves once the process has exited. */
async function stop(run: Running): Promise<void> {
  if (run.child.exitCode !== null || run.child.signalCode !== null) return
  run.child.kill('SIGTERM')
  const timer = setTimeout(() => run.child.kill('SIGKILL'), 5_000)
  await run.exited
  clearTimeout(timer)
}

/** Start the packaged app with CDP and attach to its main window. */
async function launchPackaged(env: Record<string, string> = {}): Promise<Connected> {
  const run = start(['--remote-debugging-port=0'], env)
  let browser: Browser | undefined
  try {
    return await attach(run, (b) => (browser = b))
  } catch (err) {
    // A launch that never reached the main window must not leave the app running.
    await browser?.close().catch(() => undefined)
    await stop(run)
    throw err
  }
}

async function attach(run: Running, onBrowser: (b: Browser) => void): Promise<Connected> {
  const ws = await waitFor(
    () => /DevTools listening on (ws:\/\/\S+)/.exec(run.output())?.[1],
    'the DevTools endpoint',
  )
  const browser = await chromium.connectOverCDP(ws)
  onBrowser(browser)
  const page = await waitFor(
    () =>
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().startsWith(APP_INDEX)),
    'the main window',
  )
  await page.waitForLoadState('domcontentloaded')
  return { ...run, browser, page }
}

/** Every page the packaged app has open, across CDP contexts. */
const allPages = (browser: Browser): Page[] => browser.contexts().flatMap((c) => c.pages())

/** HTTP status of an app:// URL fetched from inside the renderer. */
async function appStatus(page: Page, url: string): Promise<number | string> {
  return page.evaluate(async (u) => {
    try {
      return (await fetch(u)).status
    } catch (err) {
      return String(err)
    }
  }, url)
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
  test.afterAll(async () => {
    await Promise.all([...live].map(stop))
    expect(processesOf(EXE), 'no packaged app process may outlive the spec').toEqual([])
  })
  test.beforeAll(() => {
    if (!existsSync(EXE)) throw new Error(`Packaged executable not found: ${EXE}`)
  })

  test('starts, ingests PDF/DOCX/PNG (OCR) into sqlite-vec and serves ttx-media', async () => {
    test.setTimeout(180_000)
    const app = await launchPackaged()
    const invoke = invoker(app.page)
    try {
      await expect(app.page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
      const info = await invoke<{ electron: string; name: string }>('app:info')
      expect(info.electron).toBe('45.0.0')
      // The menu bar, About and Quit use the app name (#277).
      expect(info.name).toBe('Action Stations')

      const parentDir = mkdtempSync(join(tmpdir(), 'ttx-packaged-proj-'))
      const { path: projectPath } = await invoke<{ path: string }>('project:create', {
        parentDir,
        name: 'Packaged Smoke',
      })
      expect(projectPath.endsWith('Packaged-Smoke.asproj')).toBe(true)
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

  test('loads the bundled packs from app-resources/packs (ADR-0020)', async () => {
    test.setTimeout(120_000)
    const app = await launchPackaged()
    const invoke = invoker(app.page)
    try {
      const packs =
        await invoke<
          { id: string; bundled?: boolean; core?: boolean; enabled: boolean; broken?: string }[]
        >('packs:list')
      const bundled = packs.filter((p) => p.bundled)
      expect(bundled.map((p) => p.id)).toContain('ai.actionstations.core')
      expect(bundled.length).toBe(13)
      expect(bundled.filter((p) => p.broken)).toEqual([])
      const tweet = (await invoke<{ type: string; packId?: string }[]>('templates:list')).find(
        (t) => t.type === 'tweet',
      )
      expect(tweet?.packId).toBe('ai.actionstations.core')
      const examples = await invoke<{ slug: string; packId?: string }[]>('examples:list')
      expect(examples.find((e) => e.slug === 'airport-ncia')?.packId).toBe(
        'ai.actionstations.airport',
      )
      const domains =
        await invoke<{ profile: { id: string }; source: { kind: string } }[]>('domains:list')
      expect(domains.find((d) => d.profile.id === 'water_utility')?.source.kind).toBe('bundled')
      const prompts = await invoke<{ name: string }[]>('prompts:list', {})
      expect(prompts.length).toBeGreaterThanOrEqual(12)
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

  test('app://bundle serves the renderer with file:// privileges off; presentation works', async () => {
    test.setTimeout(120_000)
    const app = await launchPackaged()
    const invoke = invoker(app.page)
    try {
      expect(app.page.url().startsWith(APP_INDEX)).toBe(true)
      await expect(app.page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
      expect(
        await app.page.evaluate(
          () => (globalThis as unknown as { location: { origin: string } }).location.origin,
        ),
      ).toBe('app://bundle')
      // Bundled webfonts load from app:// (correct font/woff2 MIME type).
      const interLoaded = await app.page.evaluate(async () => {
        const fonts = (
          globalThis as unknown as {
            document: { fonts: { load(f: string): Promise<unknown[]> } }
          }
        ).document.fonts
        return (await fonts.load('500 16px Inter')).length
      })
      expect(interLoaded).toBeGreaterThan(0)
      // Path guard and no directory listing, served out of app.asar.
      expect(await appStatus(app.page, 'app://bundle/index.html')).toBe(200)
      expect(await appStatus(app.page, 'app://bundle/assets/')).toBe(404)
      expect(await appStatus(app.page, 'app://bundle/%2e%2e%2fmain%2findex.js')).toBe(404)
      expect(await appStatus(app.page, 'app://bundle/../main/index.js')).toBe(404)
      expect(await appStatus(app.page, 'app://bundle/nope.js')).toBe(404)

      const parentDir = mkdtempSync(join(tmpdir(), 'ttx-packaged-present-'))
      const { path: projectPath } = await invoke<{ path: string }>('project:create', {
        parentDir,
        name: 'Packaged Present',
      })
      const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
        projectPath,
        title: 'Flight to Nowhere',
      })
      const fixture = JSON.parse(readFileSync(SCENARIO_3, 'utf8')) as Record<string, unknown>
      await invoke('scenarios:save', {
        projectPath,
        scenario: { ...fixture, id: empty.id, projectId: empty.projectId },
      })
      const fids = await invoke<{ id: string }>('injects:create', {
        projectPath,
        scenarioId: empty.id,
        mselRowId: 'I-06',
        type: 'fids_board',
      })
      const fields = JSON.parse(
        readFileSync(resolve('templates/injects/fids_board/preview.json'), 'utf8'),
      ).fields as Record<string, unknown>
      await invoke('injects:save', {
        projectPath,
        scenarioId: empty.id,
        inject: { ...fids, fields },
      })
      // Template rendering loads file:// documents in the render partition.
      await invoke('render:inject', { projectPath, scenarioId: empty.id, injectId: fids.id })
      await invoke('facilitator:present', { projectPath, scenarioId: empty.id, injectId: fids.id })

      const present = await waitFor(
        () => allPages(app.browser).find((p) => p.url().includes('#/present/')),
        'the presentation window',
      )
      expect(present.url().startsWith(`${APP_INDEX}#/present/`)).toBe(true)
      const img = present.getByRole('img')
      await expect(img).toBeVisible()
      await expect
        .poll(() => img.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth))
        .toBeGreaterThan(1000)
      expect(await img.getAttribute('src')).toMatch(/^ttx-media:\/\//)
      // The presentation window is the same trusted document: IPC works from it.
      const info = await invoker(present)<{ electron: string }>('app:info')
      expect(info.electron).toBe('45.0.0')
      await present.screenshot({ path: 'test-results/packaged-present.png' })
      await invoke('facilitator:close-present')
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

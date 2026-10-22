// Built-app checks for the ingest / embeddings / providers backlog (#60, #65, #69, #79).
// Screenshots go to .tmp/backlog/ (Playwright wipes test-results/ on every run).
import { expect, test, type Page } from '@playwright/test'
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildPdf, scanImage } from '../tests/fixtures/ingest/builders'
import { invoker, launch } from './helpers'

const SHOTS = resolve('.tmp/backlog')
const LIVE_MODEL = join(tmpdir(), 'ttx-test-models', 'Xenova', 'bge-small-en-v1.5')
const OLLAMA = 'http://127.0.0.1:11434'

interface Job {
  status: string
  error?: string
  message: string
}

async function waitJob(invoke: ReturnType<typeof invoker>, jobId: string, ms = 120_000) {
  const until = Date.now() + ms
  for (;;) {
    const job = await invoke<Job>('jobs:get', { jobId })
    if (['done', 'error', 'cancelled'].includes(job.status)) return job
    if (Date.now() > until) throw new Error(`job ${jobId} still ${job.status}`)
    await new Promise((r) => setTimeout(r, 250))
  }
}

async function goTo(page: Page, hash: string) {
  await page.evaluate((h) => {
    ;(globalThis as unknown as { location: { hash: string } }).location.hash = h
  }, hash)
}

/** Screenshot the current screen in light and dark; `prepare` restores state after reload. */
async function snapBothThemes(
  page: Page,
  invoke: ReturnType<typeof invoker>,
  name: string,
  prepare: () => Promise<void>,
) {
  mkdirSync(SHOTS, { recursive: true })
  for (const theme of ['light', 'dark'] as const) {
    await invoke('settings:update', { ui: { theme } })
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await prepare()
    await page.screenshot({ path: join(SHOTS, `${name}-${theme}.png`), fullPage: true })
  }
}

function writeSourceFiles(dir: string) {
  const page = (n: number, topic: string) => [
    { text: `SECTION ${n}: ${topic.toUpperCase()}`, size: 18, bold: true },
    { text: `${n}.1 Initial actions`, size: 14, bold: true, spaceBefore: 1 },
    { text: `The duty manager confirms the ${topic} checklist`, size: 11, spaceBefore: 0.5 },
    { text: 'and reports status to the operations center.', size: 11 },
  ]
  const scanned = join(dir, 'Scanned Terminal Procedures.pdf')
  writeFileSync(
    scanned,
    buildPdf(
      ['terminal evacuation', 'baggage system outage', 'public information'].map((t, i) => ({
        lines: [],
        scan: scanImage(page(i + 1, t)),
      })),
    ),
  )
  const md = join(dir, 'fids-plan.md')
  writeFileSync(
    md,
    [
      '# FIDS Plan',
      '## 1 Failure modes',
      '### 1.1 Board outage',
      '**Impact:** gate agents announce departures _manually_ when the FIDS fails.',
      '',
      '| System | Owner |',
      '|---|---|',
      '| FIDS | Airport IT |',
    ].join('\n'),
  )
  return { scanned, md }
}

test('scanned PDF is OCRd page by page; headings indent; snippets read as text', async () => {
  test.setTimeout(180_000)
  const { app, page } = await launch()
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  const invoke = invoker(page)
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-proj-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'Backlog Ingest',
    })
    const files = writeSourceFiles(parentDir)
    const started = Date.now()
    const { jobId } = await invoke<{ jobId: string }>('documents:import', {
      projectPath,
      filePaths: [files.scanned, files.md],
    })
    expect((await waitJob(invoke, jobId)).status).toBe('done')
    console.log(`import (2 files, 3 OCR pages): ${Date.now() - started} ms`)

    const docs = await invoke<{ id: string; title: string; status: string; pages: number }[]>(
      'documents:list',
      { projectPath },
    )
    const scanned = docs.find((d) => d.pages === 3)!
    expect(scanned.status).toBe('ok')
    const chunks = await invoke<{ page?: number; text: string }[]>('documents:chunks', {
      projectPath,
      documentId: scanned.id,
    })
    expect([...new Set(chunks.map((c) => c.page))]).toEqual([1, 2, 3])
    expect(chunks.map((c) => c.text).join(' ')).toMatch(/baggage system outage checklist/i)

    const key = encodeURIComponent(projectPath)
    const openHeadings = async () => {
      await goTo(page, `#/p/${key}/documents`)
      const table = page.getByRole('table', { name: 'Project documents' })
      await table.getByRole('button', { name: /^Show details for Scanned/ }).click()
      const tree = page.getByRole('region', { name: /^Headings of/ })
      const nested = tree.locator('.heading-tree__level:not(.heading-tree__level--root) li')
      await expect(nested.first()).toBeVisible()
    }
    await openHeadings()
    await snapBothThemes(page, invoke, 'documents-headings', openHeadings)

    const runSearch = async () => {
      await goTo(page, `#/p/${key}/search`)
      await page.getByLabel('Query').fill('manual announcements FIDS owner')
      await page.keyboard.press('Enter')
      await expect(page.locator('.hit__text').first()).toBeVisible()
    }
    await runSearch()
    const all = (await page.locator('.hit__text').allTextContents()).join('\n')
    expect(all).not.toMatch(/\*\*|\|---|\| FIDS/)
    expect(all).toMatch(/Impact: gate agents/)
    await snapBothThemes(page, invoke, 'search-snippets', runSearch)
    expect(pageErrors).toEqual([])
  } finally {
    await app.close()
  }
})

test('local ONNX embeddings run in a utilityProcess that survives a crash', async () => {
  test.skip(!existsSync(join(LIVE_MODEL, 'onnx/model.onnx')), 'bge-small not downloaded (LIVE)')
  test.setTimeout(300_000)
  const { app, page, userData } = await launch()
  const invoke = invoker(page)
  try {
    cpSync(LIVE_MODEL, join(userData, 'models', 'Xenova', 'bge-small-en-v1.5'), {
      recursive: true,
    })
    await invoke('settings:update', {
      embeddings: { mode: 'local-onnx', model: 'Xenova/bge-small-en-v1.5' },
    })
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-proj-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'Embeddings Worker',
    })
    const plan = join(parentDir, 'long-plan.md')
    const body = (i: number) =>
      `## ${i} Procedure ${i}\n` +
      'Terminal staff coordinate with the airport operations center, confirm the checklist, and report status to the incident commander every fifteen minutes. '.repeat(
        12,
      )
    writeFileSync(plan, `# Long Plan\n${Array.from({ length: 600 }, (_, i) => body(i)).join('\n')}`)
    const t0 = Date.now()
    const { jobId } = await invoke<{ jobId: string }>('documents:import', {
      projectPath,
      filePaths: [plan],
    })
    expect((await waitJob(invoke, jobId, 240_000)).status).toBe('done')
    const [meta] = await invoke<{ status: string; chunkCount: number; error?: string }[]>(
      'documents:list',
      { projectPath },
    )
    console.log(
      `indexed long plan (${meta!.chunkCount} chunks, ${meta!.status}${meta!.error ? `: ${meta!.error}` : ''}) with bge-small in utilityProcess: ${Date.now() - t0} ms`,
    )
    expect(meta!.status).toBe('ok')
    const hits = await invoke<unknown[]>('retrieve:search', {
      projectPath,
      query: 'who receives status reports',
      mode: 'vector',
    })
    expect(hits.length).toBeGreaterThan(0)

    const utilityPids = () =>
      app.evaluate(({ app: a }) =>
        a
          .getAppMetrics()
          .filter((m) => m.type === 'Utility')
          .map((m) => ({ pid: m.pid, name: m.name ?? m.serviceName ?? '' })),
      )
    console.log('utility processes', JSON.stringify(await utilityPids()))
    const [pid] = (await utilityPids()).filter((u) => /Embeddings/.test(u.name)).map((u) => u.pid)
    expect(pid).toBeTruthy()

    // Crash the child mid-rebuild: the document fails with a PROVIDER message, the app stays up.
    type Doc = { status: string; error?: string }
    const doc = async () => (await invoke<Doc[]>('documents:list', { projectPath }))[0]!
    const rebuild = await invoke<{ jobId: string }>('index:rebuild', { projectPath })
    for (let i = 0; i < 400 && (await doc()).status !== 'embedding'; i++)
      await page.waitForTimeout(25)
    await page.waitForTimeout(300)
    process.kill(pid!, 'SIGKILL')
    await waitJob(invoke, rebuild.jobId, 240_000)
    const failed = await doc()
    console.log(`after SIGKILL: document ${failed.status} — ${failed.error}`)
    expect(failed.status).toBe('error')
    expect(failed.error).toMatch(/local embedding process stopped/i)
    expect(await page.title()).toBeTruthy()

    const again = await invoke<{ jobId: string }>('index:rebuild', { projectPath })
    expect((await waitJob(invoke, again.jobId, 240_000)).status).toBe('done')
    expect((await doc()).status).toBe('ok')
    const [newPid] = (await utilityPids())
      .filter((u) => /Embeddings/.test(u.name))
      .map((u) => u.pid)
    expect(newPid).toBeTruthy()
    expect(newPid).not.toBe(pid)
  } finally {
    await app.close()
  }
})

test('Providers screen pulls an Ollama model with progress', async () => {
  const reachable = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) })
    .then((r) => r.ok)
    .catch(() => false)
  test.skip(!reachable, 'Ollama is not running')
  test.setTimeout(300_000)
  const model = process.env.TTX_PULL_MODEL ?? 'smollm:135m'
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    await invoke('providers:upsert', {
      config: { kind: 'ollama', label: 'Ollama', baseUrl: OLLAMA, options: {}, enabled: true },
    })
    await goTo(page, '#/providers')
    const card = page.getByRole('article', { name: 'Ollama' })
    await expect(card.getByText(/^Reachable/)).toBeVisible({ timeout: 15_000 })
    const fillForm = async () => {
      await goTo(page, '#/providers')
      await expect(card.getByText(/^Reachable/)).toBeVisible({ timeout: 15_000 })
      await card.getByLabel('Pull a model').fill(model)
    }
    await snapBothThemes(page, invoke, 'providers-pull-form', fillForm)
    await card.getByRole('button', { name: 'Pull' }).click()
    await expect(card.getByRole('progressbar', { name: `Pulling ${model}` })).toBeVisible()
    await page.screenshot({ path: join(SHOTS, 'providers-pull-progress.png'), fullPage: true })
    const outcome = page.getByText(`Pulled ${model}`).or(page.getByText(`Could not pull ${model}`))
    await expect(outcome).toBeVisible({ timeout: 280_000 })
    const failure = page.getByRole('alert').filter({ hasText: `Could not pull ${model}` })
    if (await failure.isVisible()) {
      const text = (await failure.textContent()) ?? ''
      test.skip(/no such host|lookup|network/i.test(text), `Ollama registry unreachable: ${text}`)
      throw new Error(text)
    }
    await expect(card.getByLabel('Pull a model')).toBeVisible()
  } finally {
    await app.close()
  }
})

const reachable = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(2000) })
    .then((r) => r.ok)
    .catch(() => false)

test('setup wizard preselects the loaded LM Studio model and speaks a test line', async () => {
  const lmStudio = await reachable('http://127.0.0.1:1234/api/v0/models')
  const voice = await reachable('http://127.0.0.1:8765/v1/models')
  test.skip(!lmStudio || !voice, 'LM Studio and the local voice server must be running')
  test.setTimeout(180_000)
  const loaded = (
    (await (await fetch('http://127.0.0.1:1234/api/v0/models')).json()) as {
      data: { id: string; type: string; state: string }[]
    }
  ).data.filter((m) => m.state === 'loaded' && m.type !== 'embeddings')
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    const openStep = async (step: string) => {
      await page.evaluate((s) => {
        localStorage.setItem('ttx.onboarding', JSON.stringify({ step: s }))
      }, step)
      // Remount the wizard so it reads the saved step.
      await goTo(page, '#/projects')
      await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
      await goTo(page, '#/welcome')
      await expect(page.getByRole('heading', { name: 'Set up Tabletop Generator' })).toBeVisible()
    }
    await openStep('text')
    const list = page.getByRole('list', { name: 'Local text services' })
    const select = list.getByLabel('LM Studio model')
    await expect(select).toBeVisible({ timeout: 15_000 })
    if (loaded[0]) {
      await expect(select).toHaveValue(loaded[0].id)
      await expect(list.getByText(`${loaded[0].id} loaded`, { exact: false })).toBeVisible()
    }
    await snapBothThemes(page, invoke, 'welcome-text-loaded', async () => {
      await openStep('text')
      await expect(page.getByRole('list', { name: 'Local text services' })).toBeVisible()
    })

    await openStep('media')
    await page.getByRole('button', { name: 'Connect voice server' }).click()
    await expect(page.getByLabel('Voice model')).toBeVisible({ timeout: 15_000 })
    const t0 = Date.now()
    await page.getByRole('button', { name: 'Speak a test line' }).click()
    await expect(page.getByText(/^Spoke [\d.]+ s of audio/)).toBeVisible({ timeout: 150_000 })
    console.log(`speech test round trip: ${Date.now() - t0} ms`)
    const audio = page.getByLabel('Test line')
    await expect(audio).toHaveAttribute('src', /^blob:/)
    const duration = await audio.evaluate(
      (el) =>
        new Promise<number>((resolve) => {
          const a = el as unknown as { duration: number; readyState: number }
          if (a.readyState >= 1) resolve(a.duration)
          else el.addEventListener('loadedmetadata', () => resolve(a.duration), { once: true })
        }),
    )
    console.log(`decoded test audio: ${duration.toFixed(2)} s`)
    expect(duration).toBeGreaterThan(0.5)
    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: join(SHOTS, 'welcome-speech-test.png'), fullPage: true })
  } finally {
    await app.close()
  }
})

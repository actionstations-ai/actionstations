// Retakes the user-guide screenshots in docs/guides/images/ from the built app (#242).
// Skipped unless GUIDE_SHOTS=1:  pnpm build:app && GUIDE_SHOTS=1 pnpm exec playwright test e2e/guide-screenshots.spec.ts
// Runs offline with the mock provider and an isolated userData dir, at 1440 × 900 like the
// existing images. The early steps use a fresh project with the NCIA plans; the scenario,
// inject, facilitator and export screens use a copy of the bundled airport example
// ("Flight to Nowhere"), whose example marker is removed so no banner shows. Detection screens
// see a stand-in LM Studio on 127.0.0.1:1234 (model list only) when that port is free, so the
// wizard and Providers page show what the guide describes; real services found on this
// computer (Ollama, ComfyUI, the system voice) show as they are.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch, mdFiles } from './helpers'

test.skip(process.env.GUIDE_SHOTS !== '1', 'set GUIDE_SHOTS=1 to retake the guide screenshots')
test.setTimeout(300_000)

const OUT = resolve('docs/guides/images')
const ENV = { TTX_MOCK_PROVIDERS: '1', TTX_EXAMPLES_DIR: resolve('examples') }
const DOCS = [...mdFiles('reference/ncia'), ...mdFiles('reference/ics-forms')]
const PROJECT = 'North Coast International Airport'
const LMS_MODELS = [
  { id: 'qwen3-30b-a3b-2507', type: 'llm', state: 'loaded' },
  { id: 'gemma-3-27b-it', type: 'vlm', state: 'not-loaded' },
  { id: 'text-embedding-nomic-embed-text-v1.5', type: 'embeddings', state: 'not-loaded' },
]

/** Viewport screenshot without leftover notifications (they would hide content). */
async function shot(page: Page, name: string) {
  await page
    .locator('.toast')
    .evaluateAll((els) =>
      els.forEach((e) => ((e as unknown as { style: { display: string } }).style.display = 'none')),
    )
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(OUT, `${name}.png`) })
}

/** 1440 × 900 like the existing images; waits for the first page so later hash changes stick. */
async function sized(app: ElectronApplication, page: Page) {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900),
  )
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 })
}

/** Stand-in for LM Studio's model list; undefined when port 1234 is already taken. */
function fakeLmStudio(): Promise<Server | undefined> {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/v1/models')
      res.end(JSON.stringify({ data: LMS_MODELS.map((m) => ({ id: m.id, object: 'model' })) }))
    else if (req.url === '/api/v0/models') res.end(JSON.stringify({ data: LMS_MODELS }))
    else {
      res.statusCode = 404
      res.end('{}')
    }
  })
  return new Promise((done) => {
    server.once('error', () => done(undefined))
    server.listen(1234, '127.0.0.1', () => done(server))
  })
}

let lms: Server | undefined
test.beforeAll(async () => {
  lms = await fakeLmStudio()
})
test.afterAll(() => lms?.close())

test('setup wizard', async () => {
  const { app, page, userData } = await launch(ENV, { onboarding: true })
  try {
    await sized(app, page)
    await expect(page.getByRole('heading', { level: 1, name: /Set up/ })).toBeVisible()
    await shot(page, 'first-launch')
    await page
      .getByRole('button', { name: /^(Next|Get started|Continue)/ })
      .first()
      .click()
    await page.getByRole('button', { name: 'Decide later' }).click()
    await expect(page.getByText('qwen3-30b-a3b-2507').first()).toBeVisible({ timeout: 15_000 })
    await shot(page, 'wizard-text-model')
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})

test('project, documents, facts, search, ideas, generate', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'ttx-guide-'))
  const { app, page } = await launch(ENV)
  const invoke = invoker(page)
  try {
    await sized(app, page)
    await invoke('settings:update', { defaultProjectsDir: parent })
    await page.reload()
    await page.getByRole('button', { name: 'New project' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New project' })
    await dialog.getByLabel('Project name').fill(PROJECT)
    await dialog
      .getByLabel('Organization', { exact: true })
      .fill('North Coast Regional Airport Authority')
    await dialog.getByRole('combobox', { name: 'Domain' }).fill('airport')
    await dialog.getByRole('option', { name: /^Airport/ }).click()
    await shot(page, 'new-project')
    await dialog.getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(PROJECT) })).toBeVisible()
    const projectPath = join(parent, `${PROJECT.replace(/ /g, '-')}.asproj`)
    const key = encodeURIComponent(projectPath)

    await invoke('documents:import', { projectPath, filePaths: DOCS })
    await goTo(page, `#/p/${key}/documents`)
    const table = page.getByRole('table', { name: 'Project documents' })
    await expect(table.getByText('Indexed')).toHaveCount(DOCS.length, { timeout: 30_000 })
    await shot(page, 'documents')

    await goTo(page, `#/p/${key}`)
    await expect(page.getByRole('heading', { name: 'Get this exercise ready' })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Next: Generate/ })).toBeVisible({
      timeout: 15_000,
    })
    await shot(page, 'project-overview')

    await goTo(page, `#/p/${key}/facts`)
    const runways = page.getByLabel('Add to Runways')
    await runways.fill('9/27')
    await runways.press('Enter')
    await shot(page, 'facility-facts')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await goTo(page, `#/p/${key}/search`)
    const q = page.getByRole('searchbox').first()
    await q.fill('FIDS failure manual announcements')
    await q.press('Enter')
    await expect(page.getByText(/13\.6/).first()).toBeVisible({ timeout: 15_000 })
    await shot(page, 'search')

    await goTo(page, `#/p/${key}/generate`)
    await page.getByRole('tab', { name: 'Give me ideas' }).click()
    await page.getByRole('button', { name: 'Give me ideas' }).click()
    const ideas = page.getByRole('list', { name: 'Scenario ideas' })
    await expect(ideas.getByRole('listitem').first()).toBeVisible({ timeout: 20_000 })
    await shot(page, 'ideas')
    await ideas
      .getByRole('button', { name: /^Develop / })
      .first()
      .click()
    const brief = page.getByRole('form', { name: 'Scenario brief' })
    await expect(brief).toBeVisible()
    await shot(page, 'brief-from-idea')
    await brief.getByRole('button', { name: 'Generate scenario' }).click()
    await expect(page.getByRole('region', { name: /^Next: write \d+ injects?$/ })).toBeVisible({
      timeout: 60_000,
    })
    await shot(page, 'scenario-next')

    const advanced = page.locator('details.advanced-info')
    if ((await advanced.getAttribute('open')) === null) await advanced.locator('summary').click()
    await page.getByRole('heading', { name: 'Stages' }).first().scrollIntoViewIfNeeded()
    await page.mouse.wheel(0, -60)
    await shot(page, 'scenario-advanced')
    await page
      .getByRole('button', { name: /^Re-run MSEL phase/ })
      .first()
      .click()
    const rerun = page.getByRole('dialog')
    await rerun
      .getByRole('textbox')
      .first()
      .fill('Make the red herring more plausible; cite ASP 6.4.')
    await shot(page, 'rerun-dialog')
    await rerun.getByRole('button', { name: 'Cancel' }).click()
  } finally {
    await app.close()
    rmSync(parent, { recursive: true, force: true })
  }
})

test('providers, prompts, templates, workflows', async () => {
  const { app, page, userData } = await launch(ENV)
  const invoke = invoker(page)
  try {
    await sized(app, page)
    await goTo(page, '#/providers')
    await page.getByRole('button', { name: 'Detect local services' }).click()
    await expect(page.getByRole('list', { name: 'Detected services' })).toBeVisible({
      timeout: 15_000,
    })
    await page.waitForTimeout(1500)
    await shot(page, 'detect-local')
    await page.getByRole('button', { name: 'Add LM Studio' }).click()
    await expect(page.getByText('LM Studio added')).toBeVisible()
    await page.getByRole('button', { name: 'Add ComfyUI' }).click()
    await expect(page.getByText('ComfyUI added')).toBeVisible()
    await page.getByRole('button', { name: /^Add System voice/ }).click()
    await expect(page.getByText(/System voice.* added/)).toBeVisible()
    type P = { id: string; label: string; kind: string }
    const providers = await invoke<P[]>('providers:list')
    const lm = providers.find((p) => p.label === 'LM Studio')!
    const voice = providers.find((p) => p.kind === 'system-tts')!
    // The guide's setup has no mock provider; the generation steps ran in the other tests.
    await invoke('providers:remove', { id: 'mock' })
    const text = { providerId: lm.id, model: 'qwen3-30b-a3b-2507' }
    await invoke('routing:set', {
      scope: 'global',
      routing: { ideate: text, draft: text, critique: text, audio: { providerId: voice.id } },
    })
    await page.reload()
    await page.getByRole('heading', { name: 'Routing' }).scrollIntoViewIfNeeded()
    await shot(page, 'providers-routing')

    await page.evaluate(() =>
      (globalThis as unknown as { scrollTo: (x: number, y: number) => void }).scrollTo(0, 0),
    )
    await page.getByRole('button', { name: 'Add provider' }).first().click()
    let dialog = page.getByRole('dialog', { name: 'Add provider' })
    await dialog.getByLabel('Type').selectOption({ label: 'OpenAI-compatible' })
    await dialog.getByLabel('Name').fill('Local TTS (mlx-audio)')
    await dialog.getByLabel('Base URL').fill('http://127.0.0.1:8765/v1')
    await dialog.getByLabel('Default model').fill('mlx-community/VoxCPM2-8bit')
    await shot(page, 'add-provider-tts')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Add provider' }).first().click()
    dialog = page.getByRole('dialog', { name: 'Add provider' })
    await dialog.getByLabel('Type').selectOption({ label: 'Anthropic' })
    await shot(page, 'add-provider-anthropic')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await goTo(page, '#/prompts')
    await expect(page.getByRole('heading', { level: 1, name: 'Prompts' })).toBeVisible()
    await shot(page, 'prompts')
    await goTo(page, '#/templates')
    await expect(page.getByRole('heading', { level: 1, name: 'Templates' })).toBeVisible()
    await page.waitForTimeout(1500)
    await shot(page, 'templates')
    await goTo(page, '#/workflows')
    await expect(page.getByRole('heading', { level: 1, name: 'Workflows' })).toBeVisible()
    await shot(page, 'workflows')
    await goTo(page, '#/settings')
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    await shot(page, 'settings')
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})

test('scenario, injects, facilitate, export (airport example)', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'ttx-guide-example-'))
  const { app, page } = await launch(ENV)
  const invoke = invoker(page)
  try {
    await sized(app, page)
    const opened = await invoke<{ path: string }>('examples:open', {
      slug: 'airport-ncia',
      parentDir: parent,
    })
    rmSync(join(opened.path, '.example.json'), { force: true })
    const key = encodeURIComponent(opened.path)
    type S = { id: string; title: string }
    const list = await invoke<S[]>('scenarios:list', { projectPath: opened.path })
    const scenario = list.find((s) => s.title === 'Flight to Nowhere')!
    const base = `#/p/${key}/scenarios/${scenario.id}`
    await page.reload()

    // Render the example's cards (it ships without them); the jobs tray shows the job while
    // the Overview is open.
    await goTo(page, base)
    await page
      .getByRole('region', { name: /^Next: render media/ })
      .getByRole('button', { name: 'Render media' })
      .click()
    await expect(page.getByText(/^Background jobs/)).toBeVisible({ timeout: 10_000 })
    await goTo(page, `#/p/${key}`)
    await page.waitForTimeout(2500)
    await shot(page, 'jobs-tray')
    await expect(page.getByText(/^Background jobs/)).toHaveCount(0, { timeout: 240_000 })

    await goTo(page, `${base}?tab=warnings`)
    await page.reload()
    await page.getByRole('tab', { name: /^Warnings/ }).click()
    await shot(page, 'scenario-warnings')
    await page.getByRole('tab', { name: /^MSEL/ }).click()
    await expect(page.getByRole('grid', { name: 'Master Scenario Events List' })).toBeVisible()
    await shot(page, 'scenario-msel')
    await page.getByRole('tab', { name: /^Documents/ }).click()
    await page.waitForTimeout(1000)
    await shot(page, 'scenario-documents')
    await page.getByRole('tab', { name: /^Injects/ }).click()
    await page.waitForTimeout(1500)
    await page.mouse.move(800, 600)
    await page.mouse.wheel(0, 330)
    await shot(page, 'inject-deck')

    type I = { id: string; type: string }
    const injects = await invoke<I[]>('injects:list', {
      projectPath: opened.path,
      scenarioId: scenario.id,
    })
    const ticket = injects.find((i) => i.type === 'helpdesk_ticket') ?? injects[0]!
    await goTo(page, `${base}/injects/${ticket.id}`)
    await page.waitForTimeout(2500)
    await shot(page, 'inject-editor')

    await goTo(page, `${base}/facilitate`)
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await shot(page, 'facilitate')

    await goTo(page, `${base}/export`)
    await expect(page.getByRole('checkbox', { name: /Distribution ZIP/ })).toBeVisible()
    await page.waitForTimeout(2500)
    await shot(page, 'export')
  } finally {
    await app.close()
    rmSync(parent, { recursive: true, force: true })
  }
})

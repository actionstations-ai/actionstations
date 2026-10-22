// Full flow (#46): one user journey through the built app with the mock provider —
// create a project in the New project dialog → import the NCIA plans → "Give me ideas" →
// "Develop this" → full pipeline to "ready" → write all injects → render all media → edit an
// inject in the editor → change an MSEL time → export every target from the Export screen →
// unzip the distribution ZIP and check its tree and the edits → facilitate: start the clock,
// deliver an inject and see the presentation window open.
// Runs in `pnpm e2e` (TTX_MOCK_PROVIDERS=1, offline, well under 90 s). Screenshots of each
// major step go to .tmp/full-flow/ (Playwright wipes test-results/ at the start of a run).
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'
import { goTo, invoker, launch, mdFiles } from './helpers'

const SHOTS = resolve('.tmp/full-flow')
const PROJECT_NAME = 'North Coast International Airport'
const EDITED_SUBJECT = 'Gate screens disagree with the AODB feed'
const NCIA = mdFiles('reference/ncia')

interface Row {
  id: string
  phaseId: string
  time: string
  purposeTag: string
}
interface Scenario {
  id: string
  title: string
  status: string
  msel: Row[]
}
interface Inject {
  id: string
  mselRowId: string
  type: string
  deliveryMode: string
  fields: Record<string, unknown>
  assets: { kind: string; role: string }[]
}
interface ExportedScenario {
  scenario: { msel: Row[]; injects: Inject[] }
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: join(SHOTS, `${String(++shotNo).padStart(2, '0')}-${name}.png`) })
let shotNo = 0

const rowById = (grid: Locator, id: string) =>
  grid
    .locator('tr')
    .filter({ has: grid.page().locator('.msel-editor__id', { hasText: new RegExp(`^${id}$`) }) })

/** New project dialog, with the default location preset (the folder picker is native). */
async function createProjectInUi(page: Page, invoke: ReturnType<typeof invoker>) {
  const parent = mkdtempSync(join(tmpdir(), 'ttx-full-flow-'))
  await invoke('settings:update', { defaultProjectsDir: parent })
  await page.reload()
  await page.getByRole('button', { name: 'New project' }).click()
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await expect(dialog.getByLabel('Location')).toHaveValue(parent)
  await dialog.getByLabel('Project name').fill(PROJECT_NAME)
  await dialog
    .getByLabel('Organization', { exact: true })
    .fill('North Coast Regional Airport Authority')
  await dialog.getByRole('combobox', { name: 'Domain' }).fill('airport')
  await dialog.getByRole('option', { name: /^Airport/ }).click()
  await shot(page, 'new-project')
  await dialog.getByRole('button', { name: 'Create project' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: new RegExp(PROJECT_NAME) }),
  ).toBeVisible()
  return join(parent, `${PROJECT_NAME.replace(/ /g, '-')}.ttxproj`)
}

/** Documents are imported over IPC (native file dialogs can't be driven), then watched. */
async function importDocuments(
  page: Page,
  invoke: ReturnType<typeof invoker>,
  key: string,
  projectPath: string,
) {
  await invoke('documents:import', { projectPath, filePaths: NCIA })
  await goTo(page, `#/p/${key}/documents`)
  const table = page.getByRole('table', { name: 'Project documents' })
  await expect(table.getByText('Indexed')).toHaveCount(NCIA.length, { timeout: 30_000 })
  await shot(page, 'documents-indexed')
}

/** Generate → Give me ideas → Develop this → Generate scenario → pipeline runs to "ready". */
async function ideateAndGenerate(page: Page, key: string) {
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
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Loading…')
  await expect(page.locator('.page-header .badge', { hasText: /^ready$/ })).toBeVisible({
    timeout: 45_000,
  })
  await shot(page, 'scenario-ready')
  const m = /\/scenarios\/([^/?]+)/.exec(decodeURIComponent(page.url()))
  return m![1]!
}

async function writeAndRender(page: Page, injectCount: () => Promise<number>, rows: number) {
  await page.getByRole('tab', { name: 'Injects' }).click()
  await page.getByRole('button', { name: 'Write all injects' }).click()
  await expect.poll(injectCount, { timeout: 30_000 }).toBe(rows)
  await expect(page.getByText(`${rows} of ${rows} rows have an inject`)).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole('button', { name: 'Render all media' })).toBeEnabled({
    timeout: 15_000,
  })
  await page.getByRole('button', { name: 'Render all media' }).click()
  await expect(
    page.getByText(`${rows} of ${rows} rows have an inject · ${rows} rendered`),
  ).toBeVisible({
    timeout: 45_000,
  })
  await expect(page.getByRole('button', { name: 'Render all media' })).toBeEnabled({
    timeout: 15_000,
  })
  await shot(page, 'deck-rendered')
}

/** Inject editor: change the ticket subject, show it on the main screen, save and re-render. */
async function editInject(page: Page, key: string, scenarioId: string, inject: Inject) {
  await goTo(page, `#/p/${key}/scenarios/${scenarioId}/injects/${inject.id}`)
  await expect(page.getByText(`Inject ${inject.mselRowId} ·`)).toBeVisible()
  await page.getByLabel('Subject *').fill(EDITED_SUBJECT)
  await page.getByLabel('Delivery').selectOption('display_main_screen')
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Unsaved changes')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(
    page.getByRole('list', { name: 'Media files' }).getByRole('img').first(),
  ).toBeVisible({
    timeout: 20_000,
  })
  await shot(page, 'inject-edited')
}

/** MSEL grid: retime one row with the keyboard; autosave writes scenario.json. */
async function editMselTime(
  page: Page,
  key: string,
  scenarioId: string,
  rowId: string,
  time: string,
) {
  await goTo(page, `#/p/${key}/scenarios/${scenarioId}?tab=msel`)
  await page.reload()
  const grid = page.getByRole('grid', { name: 'Master Scenario Events List' })
  await rowById(grid, rowId).locator('[data-col="time"]').click()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(time)
  await page.keyboard.press('Enter')
  await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 10_000 })
  await expect(rowById(grid, rowId).locator('[data-col="time"]')).toContainText(time)
  await shot(page, 'msel-edited')
}

/** Export screen: every target into a preset folder (the folder picker is native). */
async function exportAll(page: Page, key: string, scenarioId: string) {
  const outDir = mkdtempSync(join(tmpdir(), 'ttx-full-flow-out-'))
  await page.evaluate((dir) => {
    ;(globalThis as unknown as { localStorage: Storage }).localStorage.setItem(
      'ttx.export.outDir',
      dir,
    )
  }, outDir)
  await goTo(page, `#/p/${key}/scenarios/${scenarioId}/export`)
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Distribution ZIP/ })).toBeVisible()
  for (const box of await page.getByRole('checkbox').all()) await box.check()
  await shot(page, 'export-screen')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.getByRole('button', { name: /Show in Finder/ })).toBeVisible({
    timeout: 60_000,
  })
  await shot(page, 'export-done')
  // The ZIP is written beside the export folder: <outDir>/<Title>-distribution.zip.
  const zip = readdirSync(outDir).find((f) => f.endsWith('-distribution.zip'))
  expect(zip, `no distribution ZIP in ${outDir}`).toBeTruthy()
  return join(outDir, zip!)
}

async function checkZip(
  zipPath: string,
  edited: { injectId: string; rowId: string; time: string },
) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath))
  const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir)
  const facilitator = names.filter((n) => n.startsWith('facilitator/'))
  const pdfs = facilitator.filter((n) => /^facilitator\/[^/]+\.pdf$/.test(n))
  for (const suffix of [
    'MSEL',
    'Master-Inject-Deck',
    'Controller-Evaluator-Handbook',
    'Player-Briefing-Packet',
    'Exercise-Plan',
  ])
    expect(
      pdfs.some((n) => n.endsWith(`-${suffix}.pdf`)),
      suffix,
    ).toBe(true)
  expect(pdfs).toHaveLength(5)
  expect(facilitator).toEqual(
    expect.arrayContaining(['facilitator/scenario.json', 'facilitator/scenario.md']),
  )
  expect(facilitator.filter((n) => n.startsWith('facilitator/media/')).length).toBeGreaterThan(0)
  const players = names.filter((n) => n.startsWith('players/')).sort()
  expect(players).toHaveLength(3)
  expect(players[0]).toMatch(/^players\/.+-Player-Briefing-Packet\.pdf$/)
  expect(players.slice(1)).toEqual([
    'players/ICS-201-Incident-Briefing-blank.pdf',
    'players/ICS-203-Organization-Assignment-List-blank.pdf',
  ])
  const json = JSON.parse(
    await zip.file('facilitator/scenario.json')!.async('string'),
  ) as ExportedScenario
  const inject = json.scenario.injects.find((i) => i.id === edited.injectId)!
  expect(inject.fields.subject).toBe(EDITED_SUBJECT)
  expect(json.scenario.msel.find((r) => r.id === edited.rowId)!.time).toBe(edited.time)
  return names
}

async function presentationWindow(app: ElectronApplication): Promise<Page> {
  await expect
    .poll(() => app.windows().filter((w) => w.url().includes('#/present/')).length, {
      timeout: 15_000,
    })
    .toBe(1)
  return app.windows().find((w) => w.url().includes('#/present/'))!
}

/** Facilitate: start the clock, deliver the edited (main-screen) inject → presentation opens. */
async function facilitate(
  app: ElectronApplication,
  page: Page,
  key: string,
  scenarioId: string,
  rowId: string,
) {
  await goTo(page, `#/p/${key}/scenarios/${scenarioId}/facilitate`)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  const timeline = page.getByRole('region', { name: 'Timeline' })
  await timeline.getByRole('button', { name: `Deliver ${rowId}`, exact: true }).click()
  const present = await presentationWindow(app)
  await present.waitForLoadState('domcontentloaded')
  const img = present.getByRole('img')
  await expect(img).toBeVisible()
  await expect(page.locator('.fac-status')).toContainText(`${rowId} delivered`)
  await shot(page, 'facilitate')
  await present.screenshot({
    path: join(SHOTS, `${String(++shotNo).padStart(2, '0')}-present.png`),
  })
}

test('full flow: create → import → ideas → generate → injects → edit → export → facilitate', async () => {
  test.setTimeout(90_000)
  mkdirSync(SHOTS, { recursive: true })
  shotNo = 0
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900),
  )
  try {
    const projectPath = await createProjectInUi(page, invoke)
    const key = encodeURIComponent(projectPath)
    await importDocuments(page, invoke, key, projectPath)
    const scenarioId = await ideateAndGenerate(page, key)
    const scenario = await invoke<Scenario>('scenarios:get', { projectPath, scenarioId })
    expect(scenario.status).toBe('ready')
    const listInjects = () => invoke<Inject[]>('injects:list', { projectPath, scenarioId })
    await writeAndRender(page, async () => (await listInjects()).length, scenario.msel.length)

    const target = (await listInjects()).find((i) => i.type === 'helpdesk_ticket')!
    await editInject(page, key, scenarioId, target)

    const retimed = scenario.msel.find((r) => r.id === 'I-01') ?? scenario.msel[1]!
    const newTime = '0:12'
    await editMselTime(page, key, scenarioId, retimed.id, newTime)

    const zipPath = await exportAll(page, key, scenarioId)
    await checkZip(zipPath, { injectId: target.id, rowId: retimed.id, time: newTime })

    await facilitate(app, page, key, scenarioId, target.mselRowId)
  } finally {
    await app.close()
  }
})

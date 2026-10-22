// Inject editor (#39) in the built app with the mock provider and the Scenario 3 fixture:
// write every inject from the deck, then edit five inject types (tweet, FIDS board, radio
// call, memo, helpdesk ticket) through the schema-driven form, watch the live preview change,
// save (inject JSON on disk + a new user version), render to PNG, and screenshot the deck and
// editor in light and dark. Screenshots go to .tmp/inject-editor/ (test-results/ is wiped).
import { expect, test, type Locator, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { invoker, launch } from './helpers'

test.setTimeout(240_000)

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>
const OUT = resolve('.tmp/inject-editor')

interface Inject {
  id: string
  mselRowId: string
  type: string
  title: string
  fields: Record<string, unknown>
  versions: { by: string; note?: string }[]
  assets: { kind: string; role: string; path: string }[]
}

const goTo = (page: Page, hash: string) =>
  page.evaluate((h) => {
    ;(globalThis as unknown as { location: { hash: string } }).location.hash = h
  }, hash)

const setTheme = (page: Page, theme: 'light' | 'dark') =>
  page.evaluate((t) => {
    ;(
      globalThis as unknown as {
        document: { documentElement: { dataset: Record<string, string> } }
      }
    ).document.documentElement.dataset.theme = t
  }, theme)

/** Light + dark viewport screenshots; `region` is scrolled to the top first (the app's main
 *  pane scrolls, so a full-page shot would only show its top). */
async function shoot(page: Page, name: string, region?: Locator) {
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    const path = join(OUT, `${name}-${theme}.png`)
    if (region) await region.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path })
  }
  await setTheme(page, 'light')
}

async function switchType(page: Page, type: string) {
  await page.getByLabel('Type', { exact: true }).selectOption(type)
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole('button', { name: /Switch and drop/ }).click()
  }
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function save(page: Page) {
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Unsaved changes')).toHaveCount(0)
}

test('inject editor: write injects, edit five types, preview, save, render', async () => {
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-inj-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'NCIA Inject Editor E2E',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    const scenarioId = empty.id
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: scenarioId, projectId: empty.projectId },
      note: 'Scenario 3 fixture',
    })
    const key = encodeURIComponent(projectPath)
    const list = () => invoke<Inject[]>('injects:list', { projectPath, scenarioId })
    const injectFile = (id: string) =>
      join(projectPath, 'scenarios', scenarioId, 'injects', `${id}.json`)
    const onDisk = (id: string) => JSON.parse(readFileSync(injectFile(id), 'utf8')) as Inject

    // 1. Deck: write all injects with the mock provider.
    await goTo(page, `#/p/${key}/scenarios/${scenarioId}?tab=injects`)
    const deck = page.getByRole('list', { name: 'Inject deck' })
    await expect(deck.getByRole('listitem')).toHaveCount(24)
    await page.getByRole('button', { name: 'Write all injects' }).click()
    await expect.poll(async () => (await list()).length, { timeout: 120_000 }).toBe(24)
    await expect(page.getByRole('button', { name: 'Write all injects' })).toBeEnabled({
      timeout: 30_000,
    })
    await expect(page.getByText('24 of 24 rows have an inject')).toBeVisible()
    // Mock injects are schema-valid: no card carries a warning.
    await expect(deck.getByText(/\d+ warnings?/)).toHaveCount(0)

    const idOf = async (row: string) => (await list()).find((i) => i.mselRowId === row)!.id
    const open = async (row: string) => {
      await goTo(page, `#/p/${key}/scenarios/${scenarioId}/injects/${await idOf(row)}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText(`Inject ${row} ·`)).toBeVisible()
    }
    const previewSrc = () =>
      page.getByRole('tabpanel').getByRole('img').first().getAttribute('src', { timeout: 15_000 })

    // 2. I-04 → tweet: type switch, edit the text, preview updates, save, render.
    await open('I-04')
    const i04 = await idOf('I-04')
    const versionsBefore = onDisk(i04).versions.length
    await switchType(page, 'tweet')
    await page.getByLabel('Display name *').fill('Travel Guy')
    await page.getByLabel('Handle *').fill('TravelGuy99')
    await expect(page.getByRole('tabpanel').getByRole('img')).toBeVisible({ timeout: 15_000 })
    const before = await previewSrc()
    await page
      .getByLabel('Text *')
      .fill('NCIA is a joke! Boards say Gate A1, gate is empty. App says A12. #Fail #NCIA')
    await expect.poll(previewSrc, { timeout: 15_000 }).not.toBe(before)
    await shoot(page, 'editor-tweet')
    await save(page)
    const saved = onDisk(i04)
    expect(saved.type).toBe('tweet')
    expect(saved.fields.text).toContain('Boards say Gate A1')
    expect(saved.fields).not.toHaveProperty('ticketNo')
    expect(saved.versions.length).toBe(versionsBefore + 1)
    expect(saved.versions.at(-1)?.by).toBe('user')
    await page.keyboard.press('ControlOrMeta+Enter')
    const media = page.getByRole('list', { name: 'Media files' })
    await expect(media.getByRole('img')).toBeVisible({ timeout: 30_000 })
    const rendered = onDisk(i04).assets.filter((a) => a.kind === 'image' && a.role === 'rendered')
    expect(rendered).toHaveLength(1)
    expect(existsSync(join(projectPath, rendered[0]!.path))).toBe(true)
    expect(readFileSync(join(projectPath, rendered[0]!.path)).subarray(1, 4).toString()).toBe('PNG')
    await shoot(page, 'editor-tweet-rendered')

    // 3. I-06 → FIDS board: row editor.
    await open('I-06')
    await switchType(page, 'fids_board')
    const rows = page.getByRole('group', { name: /Rows/ })
    await rows.getByRole('button', { name: 'Add row' }).click()
    await page.getByLabel('Rows 1: Time').fill('10:20')
    await page.getByLabel('Rows 1: Dest').fill('ATLANTA')
    await page.getByLabel('Rows 1: Flight').fill('DL 1245')
    await page.getByLabel('Rows 1: Gate').fill('A1')
    await page.getByLabel('Rows 1: Status').fill('ON TIME')
    await rows.getByRole('button', { name: 'Add row' }).click()
    await page.getByLabel('Rows 2: Time').fill('NOW')
    await page.getByLabel('Rows 2: Dest').fill('PURGATORY')
    await page.getByLabel('Rows 2: Flight').fill('UA 666')
    await page.getByLabel('Rows 2: Status').fill('BOARDING')
    await page.getByLabel('Rows 2: Anomaly').check()
    await page.getByLabel('Variant').selectOption('glitch')
    await expect(page.getByText(/field issue/)).toHaveCount(0)
    await expect(page.getByRole('img', { name: /^Preview of/ })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Rendering…')).toHaveCount(0)
    await shoot(page, 'editor-fids')
    await save(page)
    const fids = onDisk(await idOf('I-06'))
    expect(fids.type).toBe('fids_board')
    expect(fids.fields.rows).toEqual([
      { time: '10:20', dest: 'ATLANTA', flight: 'DL 1245', gate: 'A1', status: 'ON TIME' },
      { time: 'NOW', dest: 'PURGATORY', flight: 'UA 666', status: 'BOARDING', anomaly: true },
    ])

    // 4. I-03 → radio call: message cards.
    await open('I-03')
    await switchType(page, 'radio_call')
    await page.getByLabel('Channel *').fill('OPS 1')
    const lines = page.getByRole('group', { name: /Lines/ })
    await lines.getByRole('button', { name: /Add line/ }).click()
    const line1 = page.getByRole('group', { name: 'Line 1' })
    await line1.getByLabel('From *').fill('Ramp 4')
    await line1
      .getByLabel('Text *')
      .fill('Ops, Ramp 4. Belt 3 is sending bags to the wrong carousel.')
    await save(page)
    const radio = onDisk(await idOf('I-03'))
    expect(radio.type).toBe('radio_call')
    expect((radio.fields.lines as { from: string }[])[0]?.from).toBe('Ramp 4')

    // 5. I-07 → memo: subject and description carry over (description → body).
    await open('I-07')
    await switchType(page, 'memo')
    await page.getByLabel('To *').fill('All Terminal Staff')
    await page.getByLabel('From *').fill('Airport Operations')
    await expect(page.getByLabel('Body *')).not.toHaveValue('')
    await save(page)
    const memo = onDisk(await idOf('I-07'))
    expect(memo.type).toBe('memo')
    expect(memo.fields.body).toBeTruthy()

    // 6. I-02 helpdesk ticket: give it a status the template does not allow (as a model
    // might), then fix it where the inline error points, and edit the subject.
    const badTicket = onDisk(await idOf('I-02'))
    await invoke('injects:save', {
      projectPath,
      scenarioId,
      inject: { ...badTicket, fields: { ...badTicket.fields, status: 'Open' } },
    })
    await open('I-02')
    await expect(page.getByText('1 field issue(s)')).toBeVisible()
    await expect(
      page.getByText('One of: New, In Progress, On Hold, Resolved, Closed'),
    ).toBeVisible()
    await page.getByLabel('Status').selectOption('In Progress')
    await expect(page.getByText(/field issue/)).toHaveCount(0)
    await page.getByLabel('Subject *').fill('AODB source data changed at 09:41')
    await save(page)
    const ticket = onDisk(await idOf('I-02'))
    expect(ticket.fields.subject).toBe('AODB source data changed at 09:41')
    expect(ticket.versions.at(-1)?.by).toBe('user')

    // Five types edited and stored.
    const stored = await list()
    expect(
      new Set(
        stored
          .filter((i) => ['I-04', 'I-06', 'I-03', 'I-07', 'I-02'].includes(i.mselRowId))
          .map((i) => i.type),
      ),
    ).toEqual(new Set(['tweet', 'fids_board', 'radio_call', 'memo', 'helpdesk_ticket']))

    // Deck: render all media; every inject is valid now, so all 24 render.
    await goTo(page, `#/p/${key}/scenarios/${scenarioId}?tab=injects`)
    await page.getByRole('button', { name: 'Render all media' }).click()
    await expect(page.getByText('24 of 24 rows have an inject · 24 rendered')).toBeVisible({
      timeout: 120_000,
    })
    await expect(page.getByRole('button', { name: 'Render all media' })).toBeEnabled({
      timeout: 30_000,
    })
    await expect(deck.getByRole('img')).toHaveCount(24)
    await expect(deck.getByText(/\d+ warnings?/)).toHaveCount(0)
    await shoot(page, 'deck', page.locator('.deck__toolbar'))
    await page.getByLabel('Media', { exact: true }).selectOption('with')
    await expect(deck.getByRole('listitem')).toHaveCount(24)
    await shoot(page, 'deck-filtered', page.locator('.deck__toolbar'))

    // Versions panel shows the user save.
    await open('I-02')
    await page.getByRole('tab', { name: /Versions/ }).click()
    await expect(
      page.getByRole('list', { name: 'Versions' }).getByText('You').first(),
    ).toBeVisible()
    await shoot(page, 'editor-versions')
  } finally {
    await app.close()
  }
})

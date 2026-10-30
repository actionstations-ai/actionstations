// The live-play screens in the real app (#495): start a session from the Live tab, join phones
// to it, send an inject to one device, see a device go away and the No response badge, remove
// and rekey, open the decision screen and the hot wash board, send a survey, and rebuild its
// answers from the log after the app crashed mid-session. Every window, phone and server is closed
// in `finally`. Waits are on the screen or on IPC state, never on a fixed sleep.
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch } from '../helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as { msel: Record<string, unknown>[] } & Record<string, unknown>

const DECISION = {
  id: 'dec-1',
  question: 'Shut down the FIDS boards?',
  options: [
    { id: 'yes', label: 'Shut them down' },
    { id: 'no', label: 'Keep them running' },
  ],
  defaultOptionId: 'no',
}

/** A phone on the session's self-signed server, joined to one seat. */
async function joinPhone(
  browser: Browser,
  phones: BrowserContext[],
  inviteUrl: string,
  seat: RegExp,
): Promise<Page> {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
  })
  phones.push(context)
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)
  await page.goto(inviteUrl)
  await page.getByRole('radio', { name: seat }).check()
  await page.getByRole('button', { name: 'Join exercise' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
  return page
}

async function presentWindow(app: ElectronApplication, part: string): Promise<Page> {
  await expect.poll(() => app.windows().filter((w) => w.url().includes(part)).length).toBe(1)
  const win = app.windows().find((w) => w.url().includes(part))!
  await win.waitForLoadState('domcontentloaded')
  return win
}

async function openFacilitate(page: Page, key: string, scenarioId: string): Promise<void> {
  await goTo(page, `#/p/${key}/scenarios/${scenarioId}/facilitate`)
  await expect(page.getByRole('region', { name: 'Timeline' })).toBeVisible()
}

test('live play in the app: devices, targets, away, decision, hot wash, surveys, rebuild', async ({
  browser,
}) => {
  test.setTimeout(300_000)
  const phones: BrowserContext[] = []
  const first = await launch({ TTX_MOCK_PROVIDERS: '1', TTX_LIVE_BIND: '127.0.0.1' })
  let app = first.app
  let page = first.page
  const userData = first.userData
  try {
    page.setDefaultTimeout(15_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    let invoke = invoker(page)
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-liveapp-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'Live App E2E',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    const scenarioId = empty.id
    const msel = FIXTURE.msel.map((r) =>
      r.id === 'I-10' ? { ...r, purposeTag: 'DECISION_POINT', decision: DECISION } : r,
    )
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, msel, id: scenarioId, projectId: empty.projectId },
    })
    const key = encodeURIComponent(projectPath)
    const req = { projectPath, scenarioId }
    const timeline = page.getByRole('region', { name: 'Timeline' })

    await test.step('start a session and join two devices', async () => {
      await openFacilitate(page, key, scenarioId)
      await page.getByRole('tab', { name: 'Live' }).click()
      await page.getByRole('button', { name: 'Start session' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Session running' })).toContainText(
        '0 devices connected',
      )
    })
    const inviteUrl = (await page.locator('.live-invite__url').first().textContent()) ?? ''
    const ops = await joinPhone(browser, phones, inviteUrl, /Ops Director/)
    const pio = await joinPhone(browser, phones, inviteUrl, /Public Information Officer/)

    await test.step('the Devices list names each seat and shows it online', async () => {
      const list = page.locator('.live-devices__list')
      await expect(list.locator('li', { hasText: 'Ops Director' })).toContainText('Online')
      await expect(list.locator('li', { hasText: 'Public Information Officer' })).toContainText(
        'Online',
        { timeout: 20_000 },
      )
    })

    await test.step('an inject sent to one device reaches only that device', async () => {
      await page.getByLabel('Exercise time (H:MM)').fill('0:15')
      await page.getByRole('button', { name: 'Set time', exact: true }).click()
      await timeline.getByRole('button', { name: /I-01/ }).first().click()
      await page.getByRole('tab', { name: 'Inject' }).click()
      const panel = page.getByRole('region', { name: 'Devices' }).last()
      await panel.getByRole('button', { name: 'Edit targets' }).click()
      const targets = panel.getByRole('group', { name: 'Send to' })
      await targets.getByLabel('Device: Ops Director').check()
      for (const box of await targets.getByRole('checkbox').all()) {
        const label = (await box.evaluate((el) => el.parentElement?.textContent)) ?? ''
        if (!label.startsWith('Device: Ops Director') && (await box.isChecked()))
          await box.uncheck()
      }
      await timeline.getByRole('button', { name: 'Deliver I-01', exact: true }).click()
      await expect(ops.getByRole('button', { name: /^Open / }).first()).toBeVisible()
      await expect(pio.getByText('Nothing for your seat yet.')).toBeVisible()
      await expect(panel.getByRole('region', { name: 'Device receipts' })).toContainText(
        /Ops Director/,
      )
    })

    await test.step('a device that leaves shows as away and the inject as No response', async () => {
      // One minute is the shortest window; the Room refreshes on its own 30 s tick.
      await page.getByRole('tab', { name: 'Room' }).click()
      await page.getByLabel('Flag after (minutes)').fill('1')
      await page.getByRole('button', { name: 'Set', exact: true }).click()
      await phones[1]!.close()
      const room = page.getByRole('tabpanel', { name: 'Room' })
      const seats = room.getByRole('table', { name: 'Seats' })
      await expect(room.getByText(/^No response · /)).toBeVisible({ timeout: 120_000 })
      await expect(seats.getByRole('row', { name: /^PIO / }).getByRole('cell').nth(1)).toHaveText(
        '1',
        { timeout: 120_000 },
      )
      await room.getByRole('button', { name: 'Mark I-01 answered' }).click()
      await expect(room.getByText(/^No response · /)).toHaveCount(0)
    })

    await test.step('Remove closes one device, Replace keys keeps the others', async () => {
      await page.getByRole('tab', { name: 'Live' }).click()
      page.once('dialog', (d) => void d.accept())
      await page.getByRole('button', { name: 'Replace keys' }).click()
      await expect(page.getByText(/^Keys replaced\./)).toBeVisible()
      await expect(ops.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
      page.once('dialog', (d) => void d.accept())
      await page.getByRole('button', { name: /^Remove Public Information Officer/ }).click()
      await expect(page.getByText(/^Device removed\./)).toBeVisible()
      await expect
        .poll(async () => (await invoke<unknown[]>('live:devices', req)).length)
        .toBeGreaterThan(0)
    })

    await test.step('the decision screen asks the question on the projector', async () => {
      await invoke('facilitator:present-decision', { ...req, decisionId: DECISION.id })
      const win = await presentWindow(app, '#/present/')
      await expect(win.getByRole('heading', { name: DECISION.question })).toBeVisible()
      await expect(win.getByTestId('present-decision-status')).toHaveText('The room is deciding.')
      await invoke('facilitator:close-present')
      await expect
        .poll(() => app.windows().filter((w) => w.url().includes('#/present/')).length)
        .toBe(0)
    })

    await test.step('the hot wash board takes a device item and shows it on screen', async () => {
      await page.getByRole('tab', { name: 'Hot wash board' }).click()
      await page.getByRole('button', { name: 'Open on devices' }).click()
      await ops.getByRole('button', { name: /^More/ }).click()
      await ops.getByRole('button', { name: /^Hot wash/ }).click()
      await ops.getByLabel('Improvement', { exact: true }).check()
      await ops.getByLabel('Your item').fill('Name one owner for FIDS')
      await ops.getByRole('button', { name: 'Post' }).click()
      await expect(page.getByText('Name one owner for FIDS')).toBeVisible()
      await page.getByRole('checkbox', { name: /Name one owner for FIDS/ }).check()
      await page.getByRole('button', { name: 'Promote' }).click()
      await page.getByRole('button', { name: 'Show on screen' }).click()
      const win = await presentWindow(app, '/hotwash/board')
      await expect(win.getByRole('heading', { level: 1, name: 'Hot wash' })).toBeVisible()
      await expect(win.getByText('Name one owner for FIDS')).toBeVisible()
      await invoke('facilitator:close-present')
      await expect
        .poll(() => app.windows().filter((w) => w.url().includes('#/present/')).length)
        .toBe(0)
    })

    let surveyId = ''
    await test.step('a survey goes to the devices and the answer is counted', async () => {
      const made = await invoke<{ surveys: { id: string; title: string }[] }>(
        'surveys:from-template',
        { ...req, templateId: 'hseep-participant-feedback' },
      )
      surveyId = made.surveys[0]!.id
      await page.getByRole('tab', { name: 'Live' }).click()
      await page.getByRole('button', { name: 'Send to devices' }).first().click()
      await ops.getByRole('button', { name: /^Answer the survey/ }).click()
      await ops.getByRole('radio', { name: '4 of 5' }).first().check()
      await ops.getByRole('button', { name: 'Send answers' }).click()
      await expect(
        ops.getByRole('status').filter({ hasText: 'Your answers are sent.' }),
      ).toBeVisible()
      await expect(page.getByText(/Open · 1 of \d+ answered/)).toBeVisible()
    })

    await test.step('after a crash mid-session, Resume puts back a lost survey answer', async () => {
      await invoke('surveys:delete-responses', { ...req, surveyId })
      expect(await invoke<unknown[]>('surveys:responses', { ...req, surveyId })).toHaveLength(0)
      // A crash, not a quit: quitting ends the session, a kill leaves it to be resumed.
      const exited = new Promise((done) => app.process().once('exit', done))
      app.process().kill('SIGKILL')
      await exited
      const second = await launch(
        { TTX_MOCK_PROVIDERS: '1', TTX_LIVE_BIND: '127.0.0.1' },
        { userData },
      )
      app = second.app
      page = second.page
      page.setDefaultTimeout(15_000)
      await page.setViewportSize({ width: 1440, height: 900 })
      invoke = invoker(page)
      // Let the first route settle, or it replaces the one set below.
      await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
      await openFacilitate(page, key, scenarioId)
      await page.getByRole('tab', { name: 'Live' }).click()
      await page
        .getByRole('button', { name: /^Resume / })
        .first()
        .click()
      await expect
        .poll(
          async () => (await invoke<unknown[]>('surveys:responses', { ...req, surveyId })).length,
        )
        .toBe(1)
    })
  } finally {
    for (const c of phones) await c.close().catch(() => undefined)
    await app.close().catch(() => undefined)
  }
})

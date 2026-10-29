// Evaluator observations (#416) end to end over the harness: the built player page, a scripted
// controller that sends the assignment under the staff key and keeps the observations it
// receives, one evaluator on a tablet and two players on phones. Checks the capabilities and
// citations, the Watch-for strip after a release, a rating with a note, three ratings made
// offline arriving once and in order, the controller notice, a player that never gets the
// assignment, the read-only list after ENDEX, and axe on the form at tablet and phone width in
// both color schemes. Screenshots go to .tmp/live/. No Electron.
import AxeBuilder from '@axe-core/playwright'
import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createWebCryptoProvider } from '../../src/shared/live/crypto/webcrypto'
import { HarnessController } from '../../src/player/harness/controller'
import { startHarness, type Harness } from '../../src/player/harness/server'

const OUT = resolve('.tmp/live')
mkdirSync(OUT, { recursive: true })

const { defaultBrowserType: _a, ...PIXEL } = devices['Pixel 7']!
const TABLET = { viewport: { width: 820, height: 1180 }, hasTouch: true }
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

const citation = (path: string) => ({ documentTitle: 'TIRP', headingPath: path, page: 41 })
const TASKS = [
  {
    id: 'T-04',
    capability: 'operational_communications',
    task: 'Verify FIDS data against AODB before trusting it',
    citation: citation('TIRP › 13.6'),
    expectedBy: 'it-director',
    rowIds: ['I-06'],
  },
  {
    id: 'T-05',
    capability: 'operational_communications',
    task: 'Notify airlines of the display outage within 15 minutes',
    citation: citation('AEP › App. 6'),
    timing: 'within 15 minutes',
    rowIds: ['I-06'],
  },
  {
    id: 'T-06',
    capability: 'cybersecurity',
    task: 'Isolate the affected VLAN',
    citation: citation('ASP › 6.4'),
    rowIds: ['I-08'],
  },
  {
    id: 'T-07',
    capability: 'cybersecurity',
    task: 'Preserve logs before restarting systems',
    citation: citation('ASP › 6.5'),
    rowIds: ['I-08'],
  },
  {
    id: 'T-08',
    capability: 'planning',
    task: 'Declare the incident level per the plan',
    citation: citation('AEP › 2.3'),
    rowIds: ['I-01'],
  },
]

interface Device {
  context: BrowserContext
  page: Page
}

async function open(browser: Browser, options: object, url: string): Promise<Device> {
  const context = await browser.newContext({ ...options, colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(url)
  return { context, page }
}

async function join(d: Device, seat: RegExp, heading = 'Inbox') {
  await d.page.getByRole('radio', { name: seat }).check()
  await d.page.getByRole('button', { name: 'Join exercise' }).click()
  await expect(d.page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
}

async function rate(page: Page, task: string, rating: RegExp) {
  await page
    .getByRole('group', { name: `Rating for ${task}` })
    .getByRole('radio', { name: rating })
    .check()
}

async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`),
    `${name} has axe violations`,
  ).toEqual([])
}

test.describe('evaluator observations over the harness', () => {
  test.setTimeout(180_000)
  let harness: Harness
  let controller: HarnessController
  const devicesOpen: Device[] = []

  test.beforeAll(async () => {
    controller = await HarnessController.create({
      crypto: createWebCryptoProvider(),
      scenarioTitle: 'Flight to Nowhere',
      sessionName: 'Evaluator rehearsal',
    })
    await controller.setAssignment({
      watch: { roleIds: [], capabilities: [] },
      showExpected: true,
      tasks: TASKS,
    })
    harness = await startHarness({ controller })
  })

  test.afterAll(async () => {
    for (const d of devicesOpen) await d.context.close()
    await harness.close()
  })

  test('an evaluator rates tasks, works offline, sees the notice, and keeps a read-only list after ENDEX', async ({
    browser,
  }) => {
    const players = harness.invite('players')
    const ops = await open(browser, PIXEL, players)
    await join(ops, /Operations Director/)
    const pio = await open(browser, PIXEL, players)
    await join(pio, /Public Information Officer/)
    const evaluator = await open(browser, TABLET, harness.invite('staff', 'evaluators'))
    await join(evaluator, /Evaluator/)
    devicesOpen.push(ops, pio, evaluator)
    const page = evaluator.page

    // Players have no Evaluate and never held an assignment.
    await ops.page.getByRole('button', { name: /More/ }).click()
    await expect(ops.page.getByRole('button', { name: /Evaluate/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(controller.received.filter((m) => m.type === 'eval.assign')).toEqual([])

    // The form groups tasks by capability with the plan citation beside each.
    await page.getByRole('button', { name: /More/ }).click()
    await page.getByRole('button', { name: /Evaluate/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Evaluate' })).toBeVisible()
    await expect(page.getByText('Evaluator 1 · watching everything')).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: /Operational Communications/ }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: /Cybersecurity/ })).toBeVisible()
    await expect(page.getByText('TIRP › 13.6, p. 41')).toBeVisible()
    await expect(
      page.getByText('Observations are about roles and procedures. Do not write names.'),
    ).toBeVisible()
    await page.screenshot({ path: resolve(OUT, 'evaluator-form-light.png') })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: resolve(OUT, 'evaluator-form-dark.png') })
    await audit(page, 'evaluator form (dark, tablet)')
    await page.emulateMedia({ colorScheme: 'light' })
    await audit(page, 'evaluator form (light, tablet)')

    // Releasing I-06 puts its two tasks in Watch for, announced once.
    await controller.release(
      {
        title: 'FIDS blank',
        body: 'Every flight display shows no data.',
        mselRowId: 'I-06',
        exerciseTime: '1:15',
      },
      ['role:it-director'],
      ['role:evaluators'],
    )
    await expect(page.getByText('I-06 at 1:15: 2 tasks to watch')).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Released I-06 at 1:15' })).toHaveCount(
      1,
    )
    await audit(page, 'evaluator form with Watch for')

    // Rate T-04 Partial with a note: revision 1 reaches the controller with the linked inject.
    await rate(page, 'Verify FIDS data against AODB before trusting it', /Partial/)
    await page
      .getByLabel('Note (what you saw, no names)')
      .first()
      .fill('IT checked AODB but trusted the cached board first')
    await page.getByLabel('Note (what you saw, no names)').first().blur()
    await expect.poll(() => controller.observationLog.length).toBe(2)
    expect(controller.observationLog.map((o) => o.payload.revision)).toEqual([1, 2])
    expect([...controller.observations.values()][0]).toMatchObject({
      taskId: 'T-04',
      rating: 'partial',
      revision: 2,
      mselRowId: 'I-06',
      notes: 'IT checked AODB but trusted the cached board first',
    })
    await expect(page.getByText('I-06 at 1:15: 1 task to watch')).toBeVisible()

    // Offline: three ratings are kept and shown as waiting, then arrive once, in order.
    await evaluator.context.setOffline(true)
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: /Offline|offline/ })
        .first(),
    ).toBeVisible()
    await rate(page, 'Isolate the affected VLAN', /Met/)
    await rate(page, 'Preserve logs before restarting systems', /Not met/)
    await rate(page, 'Declare the incident level per the plan', /Not observed/)
    await expect(page.getByText('3 observations waiting to send')).toBeVisible()
    const before = controller.observationLog.length
    await evaluator.context.setOffline(false)
    await expect(page.getByText('Everything is sent.')).toBeVisible({ timeout: 60_000 })
    const added = controller.observationLog.slice(before).map((o) => o.payload.taskId)
    expect(added).toEqual(['T-06', 'T-07', 'T-08'])
    expect(controller.observations.size).toBe(4)

    // Ask to watch: the controller's notice reaches that evaluator.
    const evaluatorId = [...controller.roster.values()].find(
      (r) => r.kind === 'evaluator',
    )!.clientId
    await controller.notice('Please watch for T-05 at the next inject.', {
      targets: [`client:${evaluatorId}`],
    })
    await page.getByRole('button', { name: /Feed/ }).first().click()
    await expect(page.getByText('Please watch for T-05 at the next inject.')).toBeVisible()

    // A general observation can be corrected after saving: same observation, next revision.
    await page.getByRole('button', { name: /More/ }).click()
    await page.getByRole('button', { name: /Evaluate/ }).click()
    await page.getByRole('button', { name: /Add an observation not tied to a task/ }).click()
    await page
      .getByLabel('Observation', { exact: true })
      .fill('Shift change hand-off was verbal only')
    await page.getByRole('button', { name: 'Save observation' }).click()
    await expect.poll(() => controller.observations.size).toBe(5)
    await page.getByRole('button', { name: /^Edit the observation from/ }).click()
    await page
      .getByLabel('Observation', { exact: true })
      .fill('Shift change hand-off was verbal only, nothing written down')
    await page.getByRole('button', { name: 'Save observation' }).click()
    await expect(
      page.getByText('Shift change hand-off was verbal only, nothing written down'),
    ).toBeVisible()
    await expect
      .poll(() => [...controller.observations.values()].find((o) => o.kind === 'note')?.revision)
      .toBe(2)
    expect(controller.observations.size).toBe(5)

    // A second evaluator on a 320 px phone: no horizontal scroll, and the form passes axe.
    const phone = await open(
      browser,
      { ...PIXEL, viewport: { width: 320, height: 640 } },
      harness.invite('staff', 'evaluators'),
    )
    await join(phone, /Evaluator/)
    devicesOpen.push(phone)
    await phone.page.getByRole('button', { name: /More/ }).click()
    await phone.page.getByRole('button', { name: /Evaluate/ }).click()
    await expect(phone.page.getByText('Evaluator 2 · watching everything')).toBeVisible()
    await audit(phone.page, 'evaluator form (phone)')
    expect(
      await phone.page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),
    ).toBe(true)

    // ENDEX: the observations stay readable and cannot be changed.
    await controller.end('endex')
    await expect(page.getByRole('heading', { name: 'The exercise has ended' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your observations' })).toBeVisible()
    await expect(page.getByText('IT checked AODB but trusted the cached board first')).toBeVisible()
    await expect(page.getByRole('radio')).toHaveCount(0)
    await audit(page, 'evaluator ended list')
  })
})

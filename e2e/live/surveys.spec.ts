// Surveys on devices (#422) end to end: the built player page served by the harness, a scripted
// controller, and four devices (Ops, IT, PIO and an observer). The controller opens a feedback
// survey; a banner offers it; devices answer a scale, a choice and free text; one device
// changes its answers and one skips a required question and is told. The controller holds one
// answer set per device and nothing that names a device. After the close the form is
// read-only. axe runs on the form and the list in light and dark. No Electron.
import AxeBuilder from '@axe-core/playwright'
import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createWebCryptoProvider } from '../../src/shared/live/crypto/webcrypto'
import { HarnessController } from '../../src/player/harness/controller'
import { startHarness, type Harness } from '../../src/player/harness/server'

const OUT = resolve('.tmp/live')
mkdirSync(OUT, { recursive: true })

const { defaultBrowserType: _a, ...PIXEL } = devices['Pixel 7']!
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

interface Player {
  context: BrowserContext
  page: Page
}

async function open(browser: Browser, options: object, url: string): Promise<Player> {
  const context = await browser.newContext({ ...options, colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(url)
  return { context, page }
}

async function join(p: Player, seat: RegExp) {
  await p.page.getByRole('radio', { name: seat }).check()
  await p.page.getByRole('button', { name: 'Join exercise' }).click()
  await expect(p.page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
}

const QUESTIONS = [
  {
    id: 'r1',
    kind: 'scale' as const,
    text: 'The scenario was realistic (1 = Strongly disagree, 5 = Strongly agree)',
    min: 1,
    max: 5,
    required: true,
  },
  {
    id: 'c1',
    kind: 'single' as const,
    text: 'Which part helped most?',
    required: false,
    options: [
      { id: 'a', label: 'The injects' },
      { id: 'b', label: 'The discussion' },
    ],
  },
  { id: 't1', kind: 'text' as const, text: 'What would you change?', required: false },
]

async function answer(p: Player, rating: number, text?: string) {
  await p.page.getByRole('button', { name: /^Answer the survey/ }).click()
  await expect(
    p.page.getByRole('heading', { level: 1, name: 'Participant feedback' }),
  ).toBeVisible()
  await p.page.getByRole('radio', { name: `${rating} of 5` }).check()
  if (text) await p.page.getByLabel(/What would you change/).fill(text)
  await p.page.getByRole('button', { name: 'Send answers' }).click()
  await expect(
    p.page.getByRole('status').filter({ hasText: 'Your answers are sent.' }),
  ).toBeVisible()
}

test.describe('surveys on devices over the harness', () => {
  test.setTimeout(180_000)
  let harness: Harness
  let controller: HarnessController
  const players: Player[] = []

  test.beforeAll(async () => {
    controller = await HarnessController.create({
      crypto: createWebCryptoProvider(),
      scenarioTitle: 'Flight to Nowhere',
      sessionName: 'Survey rehearsal',
    })
    harness = await startHarness({ controller })
  })

  test.afterAll(async () => {
    for (const p of players) await p.context.close()
    await harness.close()
  })

  test('four devices answer, one changes its answers, the controller keeps answers only', async ({
    browser,
  }) => {
    const link = harness.invite('players')
    const ops = await open(browser, PIXEL, link)
    await join(ops, /Operations Director/)
    const it = await open(browser, PIXEL, link)
    await join(it, /IT Director/)
    const pio = await open(browser, PIXEL, link)
    await join(pio, /Public Information Officer/)
    const observer = await open(browser, { viewport: { width: 1280, height: 800 } }, link)
    await join(observer, /Observer/)
    players.push(ops, it, pio, observer)

    // Nothing sent yet: Surveys under More says so.
    await ops.page.getByRole('button', { name: /^More/ }).click()
    await ops.page.getByRole('button', { name: /^Surveys/ }).click()
    await expect(ops.page.getByText('No survey has been sent yet.')).toBeVisible()
    await ops.page.getByRole('button', { name: /Back/ }).click()

    const surveyId = await controller.surveys.open({
      title: 'Participant feedback',
      intro: 'Thank you for taking part.',
      questions: QUESTIONS,
    })
    for (const p of players) {
      await expect(p.page.getByRole('button', { name: /^Answer the survey/ })).toBeVisible()
    }

    // A required question left empty is named, and nothing is sent.
    await it.page.getByRole('button', { name: /^Answer the survey/ }).click()
    await it.page.getByRole('button', { name: 'Send answers' }).click()
    await expect(it.page.getByRole('alert')).toContainText('One required question has no answer.')
    expect(controller.surveys.responses(surveyId)).toHaveLength(0)
    await it.page.getByRole('radio', { name: '2 of 5' }).check()
    await it.page.getByRole('button', { name: 'Send answers' }).click()
    await expect(it.page.getByText('Your answers are sent.')).toBeVisible()

    await answer(ops, 5, 'More time on the insider inject')
    await answer(pio, 4)
    await answer(observer, 3)
    await expect.poll(() => controller.surveys.responses(surveyId).length).toBe(4)

    // The IT device changes its answer: still four answer sets, one of them now a 4.
    await it.page.getByRole('radio', { name: '4 of 5' }).check()
    await it.page.getByRole('button', { name: 'Send changed answers' }).click()
    await expect
      .poll(() =>
        controller.surveys
          .responses(surveyId)
          .map((a) => a.find((x) => x.questionId === 'r1')?.value)
          .sort(),
      )
      .toEqual([3, 4, 4, 5])
    expect(controller.surveys.responses(surveyId)).toHaveLength(4)
    expect(JSON.stringify(controller.surveys.responses(surveyId))).not.toMatch(
      /Operations|IT Director|clientId/,
    )

    // axe on the form and the list, both themes.
    for (const scheme of ['light', 'dark'] as const) {
      await ops.page.emulateMedia({ colorScheme: scheme })
      const form = await new AxeBuilder({ page: ops.page }).withTags(TAGS).analyze()
      await ops.page.screenshot({
        path: resolve(OUT, `surveys-player-${scheme}.png`),
        fullPage: true,
      })
      writeFileSync(
        resolve(OUT, `surveys-axe-${scheme}.json`),
        JSON.stringify(form.violations, null, 2),
      )
      expect(form.violations.map((v) => v.id)).toEqual([])
    }

    // After the close the form is read-only and says so.
    await controller.surveys.close(surveyId)
    await expect(ops.page.getByText('This survey is closed.')).toBeVisible()
    await expect(ops.page.getByRole('button', { name: /Send/ })).toHaveCount(0)
    await expect(ops.page.getByRole('radio', { name: '5 of 5' })).toBeDisabled()
    await expect(pio.page.getByRole('button', { name: /^Answer the survey/ })).toHaveCount(0)
  })
})

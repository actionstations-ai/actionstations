// Inject delivery to devices (#412) end to end: the built player page served by the harness,
// a scripted controller that releases an inject with a sealed image to the Ops seat, and three
// devices (Ops phone, PIO phone, evaluator laptop). Checks release -> receive -> receipts
// (delivered, read after a second, actioned), targeting, the evaluator's copy, the text version
// and withdrawal. Screenshots go to .tmp/live/. No Electron.
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

// A 2x2 PNG: enough for the page to decode and show an image.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4EIwDiqkL4KAQBq3wf9xYhlWwAAAABJRU5ErkJggg==',
  'base64',
)

const { defaultBrowserType: _a, ...PIXEL } = devices['Pixel 7']!
const { defaultBrowserType: _b, ...IPHONE } = devices['iPhone 14']!

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

test.describe('inject delivery over the harness', () => {
  test.setTimeout(120_000)
  let harness: Harness
  let controller: HarnessController
  const players: Player[] = []

  test.beforeAll(async () => {
    controller = await HarnessController.create({
      crypto: createWebCryptoProvider(),
      scenarioTitle: 'Flight to Nowhere',
      sessionName: 'Delivery rehearsal',
    })
    harness = await startHarness({ controller })
  })

  test.afterAll(async () => {
    for (const p of players) await p.context.close()
    await harness.close()
  })

  const receipts = (status: string) =>
    controller.received.filter(
      (m) => m.type === 'inject.receipt' && (m.payload as { status: string }).status === status,
    ).length

  test('release reaches the targeted seat with its image and text, and receipts come back', async ({
    browser,
  }) => {
    const link = harness.invite('players')
    const ops = await open(browser, PIXEL, link)
    await join(ops, /Operations Director/)
    const pio = await open(browser, IPHONE, link)
    await join(pio, /Public Information Officer/)
    const evaluator = await open(
      browser,
      { viewport: { width: 1280, height: 800 } },
      harness.invite('staff', 'evaluator'),
    )
    await join(evaluator, /Evaluator/)
    players.push(ops, pio, evaluator)

    const device = await controller.client.putBlob(
      { kind: 'image', mime: 'image/png', name: 'device', width: 2, height: 2 },
      new Uint8Array(PNG),
    )
    const releaseId = await controller.release(
      {
        title: 'FIDS board',
        body: 'Board: Departures\nRow 1: DL 1189 Miami B4',
        text: {
          headline: 'FIDS board',
          body: 'Board: Departures\nRow 1: DL 1189 Miami B4',
          altText: 'FIDS board — Departures screen',
        },
        injectType: 'FIDS board',
        sender: 'Gate agent',
        exerciseTime: '1:15',
        media: [device],
        expectsResponse: true,
      },
      ['role:ops-director'],
      ['role:evaluators'],
    )

    // Ops gets the item; PIO's inbox stays empty; the evaluator follows play.
    await expect(ops.page.getByRole('button', { name: 'Open FIDS board' })).toBeVisible()
    await expect(pio.page.getByText('Nothing for your seat yet.')).toBeVisible()
    await expect.poll(() => receipts('delivered')).toBe(1)

    await ops.page.getByRole('button', { name: 'Open FIDS board' }).click()
    const img = ops.page.getByRole('img', { name: 'FIDS board — Departures screen' })
    await expect(img).toBeVisible()
    await expect
      .poll(() => img.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth))
      .toBe(2)
    expect(await img.getAttribute('src')).toMatch(/^blob:/)

    // The text version is collapsed, and is what the image is described by.
    const describedBy = await img.getAttribute('aria-describedby')
    const text = ops.page.locator(`[id="${describedBy}"]`)
    await expect(text).toBeHidden()
    await ops.page.getByText('Text version').click()
    await expect(text).toContainText('DL 1189 Miami B4')
    await ops.page.screenshot({ path: resolve(OUT, 'inject-detail-light.png') })
    await ops.page.emulateMedia({ colorScheme: 'dark' })
    await ops.page.screenshot({ path: resolve(OUT, 'inject-detail-dark.png') })
    await ops.page.emulateMedia({ colorScheme: 'light' })

    // Read after a second of the detail being visible; actioned on the button.
    await expect.poll(() => receipts('read'), { timeout: 8_000 }).toBe(1)
    await ops.page.getByRole('button', { name: 'Mark as actioned' }).click()
    await expect.poll(() => receipts('actioned')).toBe(1)
    await expect(ops.page.getByRole('button', { name: 'Marked as actioned' })).toBeDisabled()

    // The evaluator's copy says it was not addressed to them.
    await evaluator.page.getByRole('button', { name: 'Open FIDS board' }).click()
    await expect(evaluator.page.getByText(/Not addressed to you/)).toBeVisible()
    await expect(evaluator.page.getByRole('button', { name: 'Mark as actioned' })).toHaveCount(0)

    // Withdraw: the item disappears from the inbox and the feed says so.
    await controller.recall(releaseId, ['role:ops-director', 'role:evaluators'])
    await expect(ops.page.getByText('Withdrawn by the facilitator').first()).toBeVisible()
    await ops.page.getByRole('button', { name: /Inbox/ }).first().click()
    await expect(ops.page.getByRole('button', { name: 'Open FIDS board' })).toHaveCount(0)
  })
})

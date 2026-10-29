// Messages with the SimCell (#413) end to end: the built player page served by the harness, a
// scripted controller that echoes and answers, and three devices (Ops phone, PIO phone,
// evaluator laptop). Checks Reply to SimCell on an inject, a 2 MB photo re-encoded under the
// LAN cap, the echo tick, a reply in character with the "played by SimCell" caption, a thread
// the controller starts with Ops (no caption), unread badges, seat privacy and the evaluator
// having no Messages. Screenshots go to .tmp/live/. No Electron.
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

const LAN_PLAYER_CAP = 2 * 1024 * 1024

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

/** A noisy PNG of about 2 MB, drawn in the page so no image library is needed. */
async function noisePng(page: Page): Promise<Buffer> {
  // A string, because the page's DOM types are not part of this project's test config.
  const base64 = await page.evaluate<string>(`(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 600
    const ctx = canvas.getContext('2d')
    const img = ctx.createImageData(900, 600)
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.random() * 255
      img.data[i + 1] = Math.random() * 255
      img.data[i + 2] = Math.random() * 255
      img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    const blob = await new Promise((r) => canvas.toBlob((b) => r(b), 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (const b of bytes) s += String.fromCharCode(b)
    return btoa(s)
  })()`)
  return Buffer.from(base64, 'base64')
}

test.describe('messages with the SimCell over the harness', () => {
  test.setTimeout(120_000)
  let harness: Harness
  let controller: HarnessController
  const players: Player[] = []

  test.beforeAll(async () => {
    controller = await HarnessController.create({
      crypto: createWebCryptoProvider(),
      scenarioTitle: 'Flight to Nowhere',
      sessionName: 'Messages rehearsal',
    })
    harness = await startHarness({ controller })
  })

  test.afterAll(async () => {
    for (const p of players) await p.context.close()
    await harness.close()
  })

  test('PIO replies to an inject with a photo, the SimCell answers in character, Ops gets a call, the evaluator has no Messages', async ({
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

    // The evaluator follows play but has no conversation with the SimCell.
    await expect(evaluator.page.getByRole('button', { name: /Messages/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    // PIO opens an inject and taps Reply to SimCell: the inject is quoted over the composer.
    await controller.release(
      { title: 'Reporter deadline', body: 'Channel 5 wants a statement by 18:00.' },
      ['role:pio'],
    )
    await pio.page.getByRole('button', { name: 'Open Reporter deadline' }).click()
    await pio.page.getByRole('button', { name: 'Reply to SimCell' }).click()
    await expect(pio.page.getByText('Replying to: Reporter deadline')).toBeVisible()

    // A 2 MB photo is re-encoded to fit the LAN cap, then sent with the text.
    const png = await noisePng(pio.page)
    expect(png.length).toBeGreaterThan(1_500_000)
    await pio.page.getByTestId('photo-input').setInputFiles({
      name: 'whiteboard.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await expect(pio.page.getByLabel('Describe photo 1 (optional)')).toHaveValue(/Photo from PIO/)
    await pio.page
      .getByLabel('Message the SimCell')
      .fill('We are investigating. Statement at 1800.')
    await pio.page.getByRole('button', { name: 'Send' }).click()
    await expect(pio.page.getByText('✓ Sent')).toBeVisible()
    await expect(pio.page.getByLabel('Message the SimCell')).toBeFocused()

    expect(controller.messageLog).toHaveLength(1)
    const sent = controller.messageLog[0]!
    expect(sent).toMatchObject({ from: 'player', roleId: 'pio', channel: 'role:pio' })
    expect(sent.attachmentBytes).toHaveLength(1)
    expect(sent.attachmentBytes[0]).toBeGreaterThan(0)
    expect(sent.attachmentBytes[0]).toBeLessThanOrEqual(LAN_PLAYER_CAP)
    await expect(pio.page.getByText('Re: Reporter deadline')).toBeVisible()
    await expect(pio.page.getByRole('img', { name: /Photo from PIO/ })).toBeVisible()

    // The SimCell answers as the reporter; the caption is on by default.
    await controller.reply(
      'role:pio',
      'Can you confirm ransomware? Sources say yes.',
      'Channel 5 newsroom',
    )
    const log = pio.page.getByRole('log')
    await expect(log).toContainText('Channel 5 newsroom')
    await expect(log).toContainText('Can you confirm ransomware?')
    await expect(log).toContainText('played by SimCell')
    await pio.page.screenshot({ path: resolve(OUT, 'messages-thread-light.png') })
    await pio.page.emulateMedia({ colorScheme: 'dark' })
    await pio.page.screenshot({ path: resolve(OUT, 'messages-thread-dark.png') })
    await pio.page.emulateMedia({ colorScheme: 'light' })

    // Ops saw none of it.
    await ops.page.getByRole('button', { name: /Messages/ }).click()
    await expect(ops.page.getByText('No messages yet.')).toBeVisible()

    // The controller starts a call with Ops, with the caption off: Ops gets a badge, then the message.
    await ops.page.getByRole('button', { name: /Inbox/ }).first().click()
    const callId = await controller.reply(
      'role:ops-director',
      'Vendor calling: the FIDS patch is ready.',
      'Vendor',
      {
        showPlayedBy: false,
      },
    )
    await expect(ops.page.getByRole('button', { name: /Messages.*1 new/ })).toBeVisible()
    await ops.page.getByRole('button', { name: /Messages/ }).click()
    const opsLog = ops.page.getByRole('log')
    await expect(opsLog).toContainText('Vendor')
    await expect(opsLog).not.toContainText('played by SimCell')
    await expect(ops.page.getByRole('button', { name: /Messages.*new/ })).toHaveCount(0)

    // Pinning is the controller's: recorded for the hot wash, nothing shows on devices.
    controller.pin(callId)
    expect(controller.pinned).toEqual([callId])
    await expect(pio.page.getByRole('log')).not.toContainText('Vendor')
  })
})

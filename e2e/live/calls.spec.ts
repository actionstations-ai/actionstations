// Voice calls with a SimCell caller (#429) end to end: the built player page served by the harness
// and a scripted controller that rings, reads answers and ends the call. Checks the ring banner,
// the words always shown as text beside the voice, an answer by typing, the "by turns" notice, the
// next line on the same call, a spoken answer (a fake microphone, sent as a 16 kHz WAV), seats the
// call was not for, and the controller ending the call. No Electron.
import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { createWebCryptoProvider } from '../../src/shared/live/crypto/webcrypto'
import { HarnessController } from '../../src/player/harness/controller'
import { startHarness, type Harness } from '../../src/player/harness/server'

const { defaultBrowserType: _a, ...PIXEL } = devices['Pixel 7']!

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
})

interface Player {
  context: BrowserContext
  page: Page
}

async function join(browser: Browser, url: string, seat: RegExp): Promise<Player> {
  const context = await browser.newContext({ ...PIXEL, permissions: ['microphone'] })
  const page = await context.newPage()
  await page.goto(url)
  await page.getByRole('radio', { name: seat }).check()
  await page.getByRole('button', { name: 'Join exercise' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
  return { context, page }
}

/** One second of a quiet tone as a 16 kHz mono WAV: a stand-in for a rendered voice line. */
function voiceLine(): Uint8Array {
  const n = 16_000
  const out = new Uint8Array(44 + n * 2)
  const view = new DataView(out.buffer)
  const text = (at: number, s: string) => [...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + n * 2, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16_000, true)
  view.setUint32(28, 32_000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++)
    view.setInt16(44 + i * 2, Math.round(6000 * Math.sin((2 * Math.PI * 440 * i) / 16_000)), true)
  return out
}

test.describe('voice calls over the harness', () => {
  test.setTimeout(120_000)
  let harness: Harness
  let controller: HarnessController
  const players: Player[] = []

  test.beforeAll(async () => {
    controller = await HarnessController.create({
      crypto: createWebCryptoProvider(),
      scenarioTitle: 'Flight to Nowhere',
      sessionName: 'Call rehearsal',
    })
    harness = await startHarness({ controller })
  })

  test.afterAll(async () => {
    for (const p of players) await p.context.close()
    await harness.close()
  })

  test('a call rings Ops, is answered by typing and by voice, and ends; IT and the evaluator never see it', async ({
    browser,
  }) => {
    const link = harness.invite('players')
    const ops = await join(browser, link, /Operations Director/)
    const it = await join(browser, link, /IT Director/)
    const evaluator = await join(browser, harness.invite('staff', 'evaluator'), /Evaluator/)
    players.push(ops, it, evaluator)

    // The caller rings Ops with a voice line and its words.
    const first = await controller.ring(['role:ops-director'], {
      text: 'This is Dana Whitlock at Harbor Ledger. Where is your statement?',
      audio: { bytes: voiceLine(), durationSec: 1 },
      canSpeak: true,
      expectedWaitSec: 20,
    })
    const banner = ops.page.getByRole('button', { name: 'Incoming call from Dana Whitlock' })
    await expect(banner).toBeVisible()
    await banner.click()
    await expect(
      ops.page.getByRole('heading', { level: 1, name: /Phone call: Dana Whitlock, Harbor Ledger/ }),
    ).toBeVisible()
    await expect(ops.page.getByText('Where is your statement?')).toBeVisible()
    await expect(ops.page.getByRole('button', { name: 'Play the voice' })).toBeEnabled()

    // Other seats are not rung.
    await expect(it.page.getByRole('button', { name: /Incoming call/ })).toHaveCount(0)
    await expect(evaluator.page.getByRole('button', { name: /Incoming call/ })).toHaveCount(0)

    // Ops answers by typing; the page says the call goes by turns.
    await ops.page.getByLabel('Your answer').fill('Ops here. A statement is coming at two.')
    await ops.page.getByRole('button', { name: 'Send answer' }).click()
    await expect(ops.page.getByText(/not a live conversation/)).toBeVisible()
    await expect.poll(() => controller.callAnswers.length).toBe(1)
    expect(controller.callAnswers[0]).toMatchObject({
      callId: first.callId,
      turn: 1,
      text: 'Ops here. A statement is coming at two.',
    })

    // The next line arrives on the same call after a person approved it.
    await controller.ring(['role:ops-director'], {
      text: 'Two is too late for the evening edition.',
      callId: first.callId,
      turn: 2,
      canSpeak: true,
    })
    await expect(ops.page.getByText('Two is too late for the evening edition.')).toBeVisible()
    await expect(ops.page.getByLabel('Your answer')).toBeVisible()

    // Ops answers by voice: tap to talk, tap to stop and send. The controller gets a 16 kHz WAV.
    await ops.page.getByRole('button', { name: 'Tap to talk' }).click()
    await expect(ops.page.getByRole('button', { name: 'Tap to stop and send' })).toBeVisible()
    await ops.page.waitForTimeout(1500)
    await ops.page.getByRole('button', { name: 'Tap to stop and send' }).click()
    await expect.poll(() => controller.callAnswers.length, { timeout: 30_000 }).toBe(2)
    const spoken = controller.callAnswers[1]!
    expect(spoken).toMatchObject({ callId: first.callId, turn: 2 })
    const wav = spoken.audio!
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF')
    expect(new DataView(wav.buffer, wav.byteOffset).getUint32(24, true)).toBe(16_000)
    expect(wav.length).toBeGreaterThan(16_000)

    // The controller ends the call.
    await controller.endCall(['role:ops-director'], first.callId, 2)
    await expect(ops.page.getByText('The call ended.')).toBeVisible()
    await ops.page.getByRole('button', { name: 'Close' }).click()
    await expect(ops.page.getByRole('button', { name: /call from/i })).toHaveCount(0)
  })

  test('hanging up tells the controller, and a call without a voice still shows its words', async ({
    browser,
  }) => {
    const ops = await join(browser, harness.invite('players'), /Public Information Officer/)
    players.push(ops)
    const call = await controller.ring(['role:pio'], {
      text: 'Text only: please call the newsroom back.',
      canSpeak: false,
    })
    await ops.page.getByRole('button', { name: 'Incoming call from Dana Whitlock' }).click()
    await expect(ops.page.getByText('Text only: please call the newsroom back.')).toBeVisible()
    await expect(ops.page.getByRole('button', { name: 'Play the voice' })).toHaveCount(0)
    await expect(ops.page.getByRole('button', { name: 'Tap to talk' })).toHaveCount(0)
    await ops.page.getByRole('button', { name: 'Hang up' }).click()
    await expect(ops.page.getByText('You hung up.')).toBeVisible()
    await expect.poll(() => controller.callEnds.map((e) => e.callId)).toContain(call.callId)
  })
})

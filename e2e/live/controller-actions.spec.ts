// Controller actions on a running session (#494) seen from the built player page: the exercise
// clock follows `clock.state`, a key replacement (rotation with no one removed) keeps connected
// devices working, and the replaced link carries the new epoch. The scripted harness controller
// sends exactly the frames `src/main/live/session.ts` sends. No Electron.
import { devices, expect, test, type BrowserContext, type Page } from '@playwright/test'
import { createWebCryptoProvider } from '../../src/shared/live/crypto/webcrypto'
import { HarnessController } from '../../src/player/harness/controller'
import { startHarness, type Harness } from '../../src/player/harness/server'
import { parseInvite } from '../../src/shared/live/invite'

const { defaultBrowserType: _a, ...PIXEL } = devices['Pixel 7']!

test.describe('clock and key replacement on a device', () => {
  test.setTimeout(90_000)
  let harness: Harness
  let controller: HarnessController
  let context: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    controller = await HarnessController.create({
      crypto: createWebCryptoProvider(),
      scenarioTitle: 'Flight to Nowhere',
      sessionName: 'Controls rehearsal',
    })
    harness = await startHarness({ controller })
    context = await browser.newContext({ ...PIXEL, colorScheme: 'light' })
    page = await context.newPage()
    await page.goto(harness.invite('players'))
    await page.getByRole('radio', { name: /Operations Director/ }).check()
    await page.getByRole('button', { name: 'Join exercise' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
  })

  test.afterAll(async () => {
    await context.close()
    await harness.close()
  })

  test('the clock on the device follows a published clock.state', async () => {
    await controller.setClock({ elapsedMin: 25, rate: 1 })
    await expect(page.getByRole('timer')).toHaveAttribute('aria-label', /clock 0:25, paused/)
    await controller.setClock({ elapsedMin: 40, rate: 1, reason: 'nudge' })
    await expect(page.getByRole('timer')).toHaveAttribute('aria-label', /clock 0:40, paused/)
  })

  test('replacing the keys keeps a connected device working and moves the link to epoch 2', async () => {
    expect(parseInvite(harness.invite('players')).epoch).toBe(1)
    const kept = controller
      .state()
      .roster.filter((r) => r.roleId)
      .map((r) => r.clientId)
    expect(kept).toHaveLength(1)
    await controller.rotateKeys()
    expect(parseInvite(harness.invite('players')).epoch).toBe(2)
    await controller.notice('Sent after the keys were replaced')
    await page.getByRole('button', { name: 'Feed' }).click()
    await expect(page.getByText('Sent after the keys were replaced')).toBeVisible()
  })
})

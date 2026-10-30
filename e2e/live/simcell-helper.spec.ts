// The SimCell helper device (#518) end to end over the harness: the built player page in the
// SimCell seat, a scripted controller that sends drafted replies under the staff key and keeps the
// decisions it receives. Checks that only the staff link opens the seat, that a draft shows the
// player's words and the reply, that approve, edit and discard each reach the controller once with
// the right revision, that a withdrawn draft disappears, that a player's page never shows the
// queue, and axe on the queue at phone width in both color schemes. No Electron.
import AxeBuilder from '@axe-core/playwright'
import { devices, expect, test, type BrowserContext, type Page } from '@playwright/test'
import { createWebCryptoProvider } from '../../src/shared/live/crypto/webcrypto'
import { DEFAULT_SEATS, HarnessController } from '../../src/player/harness/controller'
import { startHarness, type Harness } from '../../src/player/harness/server'

const { defaultBrowserType: _a, ...PIXEL } = devices['Pixel 7']!
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

const draft = (n: number, over: Record<string, unknown> = {}) => ({
  draftId: `draft${String(n).padStart(17, '0')}`,
  revision: 1,
  status: 'queued' as const,
  persona: `Reporter ${n}, Channel 5`,
  threadLabel: 'Reporter and Airport Operations',
  playerMessage: `Can you confirm the terminal is closed (${n})?`,
  text: `We are checking with the airport (${n}). Is the terminal closed or not?`,
  flags: [],
  ...over,
})

async function open(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage()
  await page.goto(url)
  return page
}

async function join(page: Page, seat: RegExp) {
  await page.getByRole('radio', { name: seat }).check()
  await page.getByRole('button', { name: 'Join exercise' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
}

async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`),
    `${name} has axe violations`,
  ).toEqual([])
}

test.describe('SimCell helper over the harness', () => {
  test.setTimeout(120_000)
  let harness: Harness
  let controller: HarnessController

  test.beforeAll(async () => {
    controller = await HarnessController.create({
      crypto: createWebCryptoProvider(),
      scenarioTitle: 'Flight to Nowhere',
      sessionName: 'SimCell helper rehearsal',
      seats: [...DEFAULT_SEATS, { id: 'simcell', name: 'SimCell helper', kind: 'simcell' }],
    })
    harness = await startHarness({ controller })
  })

  test.afterAll(async () => {
    await harness.close()
  })

  test('a helper approves, edits and discards drafts, and a player never sees the queue', async ({
    browser,
  }) => {
    const context = await browser.newContext({ ...PIXEL, colorScheme: 'light' })
    const playerContext = await browser.newContext({ ...PIXEL, colorScheme: 'light' })
    try {
      // The players link cannot take the helper seat.
      const player = await open(playerContext, harness.invite('players'))
      await join(player, /Operations Director/)
      await player.getByRole('button', { name: /More/ }).click()
      await expect(player.getByRole('button', { name: /SimCell drafts/ })).toHaveCount(0)

      const helper = await open(context, harness.invite('staff', 'simcell'))
      await join(helper, /SimCell helper/)
      await helper.getByRole('button', { name: /More/ }).click()
      await helper.getByRole('button', { name: /SimCell drafts/ }).click()
      await expect(helper.getByRole('heading', { level: 1, name: 'SimCell drafts' })).toBeVisible()
      await expect(helper.getByText('No drafts waiting.')).toBeVisible()

      // One draft goes to the helper's device only.
      expect(await controller.offerDraft(draft(1))).toBe(1)
      await expect(helper.getByRole('heading', { level: 2, name: /Reporter 1/ })).toBeVisible()
      await expect(helper.getByText('Can you confirm the terminal is closed (1)?')).toBeVisible()
      await expect(helper.getByText('1 draft waiting.')).toBeVisible()
      await audit(helper, 'SimCell queue (light)')
      await helper.emulateMedia({ colorScheme: 'dark' })
      await audit(helper, 'SimCell queue (dark)')
      await helper.emulateMedia({ colorScheme: 'light' })

      // Approve as written.
      await helper.getByRole('button', { name: 'Send as written' }).click()
      await expect.poll(() => controller.simcellActions.length).toBe(1)
      expect(controller.simcellActions[0]!.payload).toEqual({
        draftId: draft(1).draftId,
        revision: 1,
        action: 'approve',
      })
      await expect(helper.getByText('No drafts waiting.')).toBeVisible()

      // Edit: the button changes to "Send my changes" and the text travels with the action.
      await controller.offerDraft(draft(2))
      const reply = helper.getByLabel('Reply')
      await expect(reply).toHaveValue(draft(2).text)
      await reply.fill('The terminal is open. Gate 4 is closed.')
      await helper.getByRole('button', { name: 'Send my changes' }).click()
      await expect.poll(() => controller.simcellActions.length).toBe(2)
      expect(controller.simcellActions[1]!.payload).toMatchObject({
        action: 'edit',
        text: 'The terminal is open. Gate 4 is closed.',
      })

      // An empty edit cannot be sent.
      await controller.offerDraft(draft(3))
      await helper.getByLabel('Reply').fill('   ')
      await expect(helper.getByRole('button', { name: 'Send my changes' })).toBeDisabled()
      await helper.getByRole('button', { name: 'Discard' }).click()
      await expect.poll(() => controller.simcellActions.length).toBe(3)
      expect(controller.simcellActions[2]!.payload).toMatchObject({ action: 'discard' })

      // A draft the controller handled first is withdrawn from the device.
      await controller.offerDraft(draft(4))
      await expect(helper.getByRole('heading', { level: 2, name: /Reporter 4/ })).toBeVisible()
      await controller.offerDraft(draft(4, { revision: 2, status: 'withdrawn' }))
      await expect(helper.getByText('No drafts waiting.')).toBeVisible()
      expect(controller.simcellActions).toHaveLength(3)
    } finally {
      await context.close()
      await playerContext.close()
    }
  })

  test('the staff link is needed: a players link is refused the helper seat', async ({
    browser,
  }) => {
    const context = await browser.newContext({ ...PIXEL })
    try {
      const page = await open(context, harness.invite('players'))
      await expect(page.getByRole('radio', { name: /SimCell helper/ })).toBeDisabled()
    } finally {
      await context.close()
    }
  })
})

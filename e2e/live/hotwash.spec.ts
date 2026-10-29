// Hot wash contributions from devices (#415) end to end: the built player page served by the
// harness, a scripted controller that applies the attribution rule, and five devices (Ops, IT,
// PIO, ASC and an evaluator). Players post six items (two anonymous, one answering a question,
// one about an inject), +1 reorders the board, the controller groups and promotes, devices
// follow, and an item is withdrawn. Checks the log shape (no seat on an anonymous item) and
// axe in light and dark. Screenshots go to .tmp/live/. No Electron.
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
const { defaultBrowserType: _b, ...IPHONE } = devices['iPhone 14']!
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

async function openHotWash(p: Player) {
  await p.page.getByRole('button', { name: /^More/ }).click()
  await p.page.getByRole('button', { name: /^Hot wash/ }).click()
  await expect(p.page.getByRole('heading', { level: 1, name: 'Hot wash' })).toBeVisible()
}

async function post(
  p: Player,
  text: string,
  opts: {
    kind?: 'Strength' | 'Improvement' | 'Answer to a question'
    anonymous?: boolean
    inject?: string
  } = {},
) {
  await p.page.getByLabel(opts.kind ?? 'Improvement', { exact: true }).check()
  if (opts.inject)
    await p.page.getByLabel('About an inject (optional)').selectOption({ label: opts.inject })
  await p.page.getByLabel('Your item').fill(text)
  if (opts.anonymous) await p.page.getByLabel('Post without my role').check()
  await p.page.getByRole('button', { name: 'Post' }).click()
  await expect(p.page.getByLabel('Your item')).toHaveValue('')
  if (opts.anonymous) await p.page.getByLabel('Post without my role').uncheck()
}

const idOf = (controller: HarnessController, text: string): string => {
  const found = [...controller.hotwash.items.values()].find((i) => i.text === text)
  if (!found) throw new Error(`No hot wash item "${text}"`)
  return found.itemId
}

test.describe('hot wash from devices over the harness', () => {
  test.setTimeout(180_000)
  let harness: Harness
  let controller: HarnessController
  const players: Player[] = []

  test.beforeAll(async () => {
    controller = await HarnessController.create({
      crypto: createWebCryptoProvider(),
      scenarioTitle: 'Flight to Nowhere',
      sessionName: 'Hot wash rehearsal',
      hotwash: {
        method: '3up3down',
        methodDescription: 'Three things that went well and three to change.',
        questions: [
          { id: 'hwq-1', topic: 'Coordination', text: 'What slowed Ops and IT?' },
          { id: 'hwq-2', topic: 'Insider', text: 'How did the insider change your response?' },
        ],
      },
    })
    harness = await startHarness({ controller })
  })

  test.afterAll(async () => {
    for (const p of players) await p.context.close()
    await harness.close()
  })

  test('five devices post, +1 reorders, the controller groups and promotes, an item is withdrawn', async ({
    browser,
  }) => {
    const link = harness.invite('players')
    const ops = await open(browser, PIXEL, link)
    await join(ops, /Operations Director/)
    const it = await open(browser, PIXEL, link)
    await join(it, /IT Director/)
    const pio = await open(browser, IPHONE, link)
    await join(pio, /Public Information Officer/)
    const asc = await open(browser, { viewport: { width: 1280, height: 800 } }, link)
    await join(asc, /Airport Security Coordinator/)
    const evaluator = await open(
      browser,
      { viewport: { width: 1280, height: 800 } },
      harness.invite('staff', 'evaluator'),
    )
    await join(evaluator, /Evaluator/)
    players.push(ops, it, pio, asc, evaluator)

    await controller.release({ title: 'FIDS stays on', body: 'FIDS still shows departures.' }, [
      'all',
    ])

    // Before the facilitator opens it: read-only with a plain note.
    await openHotWash(ops)
    await expect(
      ops.page.getByText('The facilitator has not opened the hot wash yet.'),
    ).toBeVisible()
    await expect(ops.page.getByLabel('Your item')).toHaveCount(0)

    await controller.hotwash.openOnDevices()
    for (const p of [it, pio, asc, evaluator]) await openHotWash(p)
    await expect(ops.page.getByText('Open', { exact: true })).toBeVisible()
    await expect(ops.page.getByText('What slowed Ops and IT?')).toBeVisible()
    await expect(ops.page.getByText(/Your role \(Operations Director\) is shown/)).toBeVisible()

    // Six items: two anonymous, one answering Q2, one about an inject.
    await post(ops, 'Two incident numbers')
    await post(it, 'Ops ticket and IT ticket did not match', { anonymous: true })
    await post(pio, 'PIO held the statement until facts were confirmed', { kind: 'Strength' })
    await post(pio, 'Clear PA script', { kind: 'Strength' })
    await asc.page.getByLabel('Answer to a question').check()
    await asc.page
      .getByLabel('Question', { exact: true })
      .selectOption({ label: 'Insider: How did the insider change your response?' })
    await asc.page.getByLabel('Your item').fill('Insider means the whole room is a crime scene')
    await asc.page.getByRole('button', { name: 'Post' }).click()
    await post(evaluator, 'No FBI liaison number in the plan', {
      anonymous: true,
      inject: 'FIDS stays on',
    })

    const board = ops.page.locator('.hw-board')
    await expect(board.getByRole('heading', { name: 'Board · 6 items' })).toBeVisible()
    await expect(board).toContainText('Operations Director')
    await expect(board.locator('li', { hasText: 'Ops ticket and IT ticket' })).toContainText(
      'anonymous',
    )
    await expect(board.locator('li', { hasText: 'No FBI liaison' })).toContainText('anonymous')
    await expect(board.locator('li', { hasText: 'Two incident numbers' })).toContainText('Yours')

    // The log keeps no seat on an anonymous item, and the controller kept the inject tag.
    const anonymousLogged = controller.hotwash.logged.filter((l) => l.anonymous)
    expect(anonymousLogged).toHaveLength(2)
    expect(anonymousLogged.every((l) => !('seat' in l))).toBe(true)
    expect(
      controller.hotwash.logged
        .filter((l) => !l.anonymous)
        .map((l) => l.seat)
        .sort(),
    ).toEqual(['asc', 'ops-director', 'pio', 'pio'])

    // Three +1s move an item to the top.
    const target = 'Ops ticket and IT ticket did not match'
    for (const p of [ops, pio, asc]) {
      const row = p.page.locator('.hw-board li', { hasText: target }).first()
      await row.getByRole('button', { name: /^Agree/ }).click()
    }
    await expect(ops.page.locator('.hw-board .hw-list > li').first()).toContainText(target)
    await expect(
      pio.page
        .locator('.hw-board li', { hasText: target })
        .getByRole('button', { name: /3 in all|3 so far/ }),
    ).toBeVisible()
    // An author cannot +1 their own item, and nobody can +1 twice.
    await expect(
      it.page.locator('.hw-board li', { hasText: target }).getByRole('button', { name: /^Agree/ }),
    ).toHaveAttribute('aria-disabled', 'true')

    // The controller groups the two incident-numbering items, names the group and promotes it.
    const ids = [idOf(controller, 'Two incident numbers'), idOf(controller, target)]
    await controller.hotwash.group(ids, 'Incident numbering')
    await controller.hotwash.promote(ids)
    const group = pio.page.locator('.hw-board .hw-group')
    await expect(group).toContainText('Incident numbering (2 items)')
    await expect(group).toContainText('Promoted to the report')
    await pio.page.screenshot({ path: resolve(OUT, 'hotwash-player-light.png'), fullPage: true })
    await pio.page.emulateMedia({ colorScheme: 'dark' })
    await pio.page.screenshot({ path: resolve(OUT, 'hotwash-player-dark.png'), fullPage: true })

    // A typo fix and a hide reach the devices.
    await controller.hotwash.edit(idOf(controller, 'Clear PA script'), 'Clear PA script, twice')
    await controller.hotwash.hide(idOf(controller, 'No FBI liaison number in the plan'))
    await expect(ops.page.locator('.hw-board')).toContainText('Clear PA script, twice')
    await expect(ops.page.locator('.hw-board')).not.toContainText('No FBI liaison')
    await expect(ops.page.getByRole('heading', { name: 'Board · 5 items' })).toBeVisible()

    // Withdraw inside two minutes.
    await post(ops, 'Wrong channel, sorry')
    await expect(pio.page.locator('.hw-board')).toContainText('Wrong channel, sorry')
    await ops.page
      .locator('.hw-board li', { hasText: 'Wrong channel' })
      .getByRole('button', { name: 'Withdraw' })
      .click()
    await expect(pio.page.locator('.hw-board')).not.toContainText('Wrong channel')

    // axe on the player hot wash screen, both themes.
    for (const scheme of ['light', 'dark'] as const) {
      await ops.page.emulateMedia({ colorScheme: scheme })
      const results = await new AxeBuilder({ page: ops.page }).withTags(TAGS).analyze()
      writeFileSync(
        resolve(OUT, `hotwash-axe-${scheme}.json`),
        JSON.stringify(results.violations, null, 2),
      )
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
    }

    // Closed: the board stays readable, the composer goes.
    await controller.hotwash.closeOnDevices()
    await expect(ops.page.getByLabel('Your item')).toHaveCount(0)
    await expect(
      ops.page.getByText('The hot wash is closed. You can read the board.'),
    ).toBeVisible()
  })

  test('review mode holds an item until the controller accepts it', async ({ browser }) => {
    // Its own room: the seats of the first test are still taken.
    const room = await HarnessController.create({ crypto: createWebCryptoProvider() })
    const roomHarness = await startHarness({ controller: room })
    try {
      const ops = await open(browser, PIXEL, roomHarness.invite('players'))
      const pio = await open(browser, PIXEL, roomHarness.invite('players'))
      players.push(ops, pio)
      await join(ops, /Operations Director/)
      await join(pio, /Public Information Officer/)
      await room.hotwash.openOnDevices(true)
      await openHotWash(ops)
      await openHotWash(pio)
      await post(ops, 'Held for review')
      await expect(ops.page.getByText('Waiting for the facilitator to show it')).toBeVisible()
      await expect(pio.page.locator('.hw-board')).not.toContainText('Held for review')
      await room.hotwash.accept(idOf(room, 'Held for review'))
      await expect(pio.page.locator('.hw-board')).toContainText('Held for review')
      await expect(ops.page.getByText('Waiting for the facilitator to show it')).toHaveCount(0)
    } finally {
      await roomHarness.close()
    }
  })
})

// The player web page (#411) end to end: the built bundle served by the dev harness
// (src/player/harness) on loopback, with the in-memory session server and a scripted
// controller. Several phones and a laptop join, get injects and notices, lose the network and
// catch up, get reseated, removed, and see the session end. Screenshots of the main states go
// to .tmp/live/ (light and dark). No Electron, no network beyond 127.0.0.1.
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

/** Device descriptors without the browser-type hint (every context runs on the test's Chromium). */
function device(name: keyof typeof devices) {
  const { defaultBrowserType: _ignored, ...rest } = devices[name]!
  return rest
}
const PIXEL = device('Pixel 7')
const IPHONE = device('iPhone 14')
const LAPTOP = { viewport: { width: 1280, height: 800 } }

interface Player {
  name: string
  context: BrowserContext
  page: Page
  /** Hosts this page talked to; must only ever be the harness. */
  hosts: Set<string>
}

async function openPlayer(
  browser: Browser,
  name: string,
  options: object,
  url: string,
): Promise<Player> {
  const context = await browser.newContext({ ...options, colorScheme: 'light' })
  const page = await context.newPage()
  const hosts = new Set<string>()
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await page.goto(url)
  return { name, context, page, hosts }
}

async function join(p: Player, seat: RegExp, displayName?: string) {
  await p.page.getByRole('radio', { name: seat }).check()
  if (displayName) await p.page.getByLabel('Display name (optional)').fill(displayName)
  await p.page.getByRole('button', { name: 'Join exercise' }).click()
  await expect(p.page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
}

async function shot(page: Page, name: string, scheme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme: scheme })
  await page.screenshot({ path: resolve(OUT, `${name}-${scheme}.png`), fullPage: false })
  if (scheme === 'dark') await page.emulateMedia({ colorScheme: 'light' })
}

test.describe('player page over the harness', () => {
  test.setTimeout(180_000)
  let harness: Harness
  let controller: HarnessController
  const players: Player[] = []

  test.beforeAll(async () => {
    controller = await HarnessController.create({
      crypto: createWebCryptoProvider(),
      scenarioTitle: 'Flight to Nowhere',
      sessionName: 'Spring rehearsal',
    })
    harness = await startHarness({ controller })
  })

  test.afterAll(async () => {
    for (const p of players) await p.context.close()
    await harness.close()
  })

  test('listens on loopback only and serves the page with a locked-down CSP', async ({
    request,
  }) => {
    expect(new URL(harness.url).hostname).toBe('127.0.0.1')
    const res = await request.get(`${harness.url}/s/${controller.sessionId}`)
    expect(res.status()).toBe(200)
    const csp = res.headers()['content-security-policy'] ?? ''
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain(`connect-src 'self' ws://127.0.0.1:${harness.port}`)
    const html = await res.text()
    expect(html).not.toContain('unsafe-inline')
    expect(html).toMatch(/'sha256-[A-Za-z0-9+/=]+'/)
    const health = await request.get(`${harness.url}/v1/health`)
    expect(await health.json()).toMatchObject({ kind: 'lan', protocol: [1] })
    expect((await request.get(`${harness.url}/etc/passwd`)).status()).toBe(404)
    // Tokens in a query string are refused (they would land in request logs).
    const stream = `${harness.url}/v1/sessions/${controller.sessionId}/events`
    expect((await request.get(`${stream}?client=playerA-00000000000000&j=AAAA`)).status()).toBe(400)
    expect((await request.get(`${stream}?client=playerA-00000000000000`)).status()).toBe(401)
  })

  test('five devices join by link and per-role card; the join screen shows seats and the attribution text', async ({
    browser,
  }) => {
    const link = harness.invite('players')
    const ops = await openPlayer(browser, 'ops', PIXEL, link)
    await expect(ops.page.getByRole('heading', { level: 1 })).toHaveText('Flight to Nowhere')
    await expect(ops.page.getByText(/non-attributional/)).toBeVisible()
    await expect(ops.page.getByText('Page 0.5.1 · protocol 1')).toBeVisible()
    await expect(ops.page.getByRole('radio', { name: /Evaluator/ })).toBeDisabled()
    await shot(ops.page, 'join')
    await shot(ops.page, 'join', 'dark')
    await join(ops, /Operations Director/, 'Dana')
    players.push(ops)

    const it = await openPlayer(browser, 'it', IPHONE, link)
    // The Ops seat is now full for the next device.
    await expect(it.page.getByText('1 of 1 seats taken · Full')).toBeVisible()
    await join(it, /IT Director/)
    players.push(it)

    // A per-role card preselects PIO; the player only confirms.
    const pio = await openPlayer(browser, 'pio', PIXEL, harness.invite('players', 'pio'))
    await expect(pio.page.getByRole('radio', { name: /Public Information Officer/ })).toBeChecked()
    await join(pio, /Public Information Officer/, 'Sam')
    players.push(pio)

    const evaluator = await openPlayer(
      browser,
      'eval',
      LAPTOP,
      harness.invite('staff', 'evaluator'),
    )
    await expect(evaluator.page.getByRole('radio', { name: /Evaluator/ })).toBeChecked()
    await join(evaluator, /Evaluator/, 'J. Ortiz')
    players.push(evaluator)

    const observer = await openPlayer(browser, 'observer', IPHONE, link)
    await join(observer, /Observer/)
    players.push(observer)

    const roster = controller.state().roster.filter((r) => r.roleId)
    expect(roster.map((r) => r.roleId).sort()).toEqual(
      ['evaluators', 'it-director', 'observers', 'ops-director', 'pio'].sort(),
    )
    expect(roster.find((r) => r.roleId === 'ops-director')?.name).toBe('Dana')
    expect(roster.every((r) => r.ua?.startsWith('websocket;'))).toBe(true)
    await expect(ops.page.getByText('Operations Director (OPS)')).toBeVisible()
    await expect(ops.page.getByText('Connected')).toBeVisible()
  })

  test('a notice reaches every feed; an inject reaches only its role, with a badge and a live announcement', async () => {
    const [ops, it, pio] = players
    await controller.notice('Hot wash in 10 minutes', { level: 'warning' })
    for (const p of players) {
      await p.page.getByRole('button', { name: 'Feed' }).click()
      await expect(p.page.getByRole('heading', { level: 2, name: /Warning/ })).toBeVisible()
      await expect(p.page.getByText('Hot wash in 10 minutes')).toBeVisible()
    }
    await controller.release(
      {
        title: 'FIDS boards dark',
        body: 'All departure boards in Terminal B show no data.',
        sender: 'Gate agent',
        exerciseTime: '0:45',
      },
      ['role:ops-director'],
    )
    await expect(ops!.page.getByRole('button', { name: /Inbox/ })).toContainText('1 new')
    await expect(ops!.page.locator('#live-region')).toHaveText(
      /New in your inbox: FIDS boards dark/,
    )
    await ops!.page.getByRole('button', { name: 'Inbox' }).click()
    await expect(
      ops!.page.getByRole('heading', { level: 2, name: /FIDS boards dark/ }),
    ).toBeVisible()
    await expect(ops!.page.getByText('From: Gate agent · To: Operations Director')).toBeVisible()
    await shot(ops!.page, 'inbox')
    await shot(ops!.page, 'inbox', 'dark')
    await it!.page.getByRole('button', { name: 'Inbox' }).click()
    await expect(it!.page.getByText('Nothing for your seat yet.')).toBeVisible()
    await expect(pio!.page.getByRole('button', { name: /Inbox/ })).not.toContainText('new')
    await shot(it!.page, 'inbox-empty')
    await pio!.page.getByRole('button', { name: 'Feed' }).click()
    await shot(pio!.page, 'feed')
    await shot(pio!.page, 'feed', 'dark')
  })

  test('a phone that goes offline shows the banner, reconnects by itself and catches up', async () => {
    const it = players[1]!
    const id = controller.state().roster.find((r) => r.roleId === 'it-director')!.clientId
    await it.context.setOffline(true)
    await expect(it.page.getByText(/You are offline/)).toBeVisible()
    // The phone sleeps: the server sees the socket go away; reconnects fail while offline.
    expect(harness.disconnect(id)).toBe(true)
    await controller.notice('Released while IT was offline', { level: 'info' })
    await controller.release({ title: 'Missed inject', body: 'Only IT gets this.' }, [
      'role:it-director',
    ])
    await it.page.waitForTimeout(3000)
    await expect(it.page.getByText('Missed inject')).toHaveCount(0)
    await it.context.setOffline(false)
    await expect(it.page.getByText("You're back").first()).toBeVisible({ timeout: 30_000 })
    await it.page.getByRole('button', { name: 'Inbox' }).click()
    await expect(it.page.getByRole('heading', { level: 2, name: /Missed inject/ })).toBeVisible()
    await it.page.getByRole('button', { name: 'Feed' }).click()
    await expect(it.page.getByText('Released while IT was offline')).toBeVisible()
    await expect(it.page.getByText('Connected')).toBeVisible({ timeout: 10_000 })
  })

  test('a reload keeps the seat and the history', async () => {
    const pio = players[2]!
    await pio.page.reload()
    await expect(pio.page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
    await expect(pio.page.getByText('Public Information Officer (PIO)')).toBeVisible()
    await pio.page.getByRole('button', { name: 'Feed' }).click()
    await expect(pio.page.getByText('Hot wash in 10 minutes')).toBeVisible()
    expect(controller.state().roster.filter((r) => r.roleId === 'pio')).toHaveLength(1)
  })

  test('More, Settings and About: disabled entries explain themselves; theme and text size persist', async () => {
    const ops = players[0]!
    const messages = ops.page.getByRole('button', { name: /Messages/ })
    await expect(messages).not.toHaveAttribute('aria-disabled', 'true')
    await ops.page.getByRole('button', { name: 'More' }).click()
    await expect(ops.page.getByRole('button', { name: /Evaluate/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await shot(ops.page, 'more')
    await ops.page.getByRole('button', { name: /Settings/ }).click()
    await ops.page.getByRole('radio', { name: 'Dark' }).check()
    await expect(ops.page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await ops.page.getByRole('radio', { name: 'Large' }).check()
    await shot(ops.page, 'settings', 'dark')
    await ops.page.reload()
    await expect(ops.page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(ops.page.locator('html')).toHaveAttribute('data-text', 'large')
    await ops.page.getByRole('button', { name: 'More' }).click()
    await ops.page.getByRole('button', { name: /Settings/ }).click()
    await ops.page.getByRole('radio', { name: 'System' }).check()
    await ops.page.getByRole('radio', { name: 'Normal' }).check()
    await ops.page.getByRole('button', { name: 'Back' }).click()
    await ops.page.getByRole('button', { name: /About/ }).click()
    await expect(ops.page.getByText('WebSocket')).toBeVisible()
    await expect(ops.page.getByText(/Your display name is not recorded/)).toBeVisible()
    await shot(ops.page, 'about')
    await ops.page.getByRole('button', { name: 'Inbox' }).click()
  })

  test('the facilitator moves a device to another seat; the header and inbox follow', async () => {
    const observer = players[4]!
    const id = controller.state().roster.find((r) => r.roleId === 'observers')!.clientId
    await controller.reseat(id, 'asc')
    await expect(observer.page.getByText('Airport Security Coordinator (ASC)')).toBeVisible()
    await observer.page.getByRole('button', { name: 'Feed' }).click()
    await expect(
      observer.page.getByText('You are now seated as Airport Security Coordinator.'),
    ).toBeVisible()
  })

  test('500 feed items render windowed and scroll', async () => {
    const evaluator = players[3]!
    await controller.notice('burst follows')
    for (let i = 1; i <= 500; i++) {
      await controller.release(
        {
          title: `Item ${i}`,
          body: `Feed item ${i} of 500.`,
          exerciseTime: `${Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')}`,
        },
        ['all'],
      )
    }
    await evaluator.page.getByRole('button', { name: 'Feed' }).click()
    await expect(evaluator.page.getByRole('heading', { level: 2, name: 'Item 500' })).toBeVisible({
      timeout: 30_000,
    })
    const list = evaluator.page.getByTestId('item-list')
    await expect(list).toHaveAttribute('data-windowed', 'true')
    const mounted = await list.locator('li').count()
    expect(mounted).toBeLessThan(80)
    await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    await expect(
      evaluator.page.getByRole('heading', { level: 2, name: /^Item 1( \(Unread\))?$/ }),
    ).toBeVisible()
    await shot(evaluator.page, 'feed-laptop')
  })

  test('a removed device sees the removed screen and stops; the others continue', async () => {
    const it = players[1]!
    const ops = players[0]!
    const id = controller.state().roster.find((r) => r.roleId === 'it-director')!.clientId
    await controller.kick(id)
    await expect(it.page.getByRole('heading', { name: 'Removed from the exercise' })).toBeVisible()
    await shot(it.page, 'removed')
    await controller.notice('Still running after the rotation')
    await ops.page.getByRole('button', { name: 'Feed' }).click()
    // The clock is paused at 0:00, so the notice sorts below the 500 timed items: scroll down.
    const list = ops.page.getByTestId('item-list')
    await expect
      .poll(async () => {
        await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
        return ops.page.getByText('Still running after the rotation').count()
      })
      .toBeGreaterThan(0)
    await it.page.waitForTimeout(2000)
    await expect(it.page.getByRole('heading', { name: 'Removed from the exercise' })).toBeVisible()
  })

  test('the session ends with the closing message on every remaining device', async () => {
    await controller.end('endex', 'Thank you all. Hot wash notes go out tomorrow.')
    for (const p of [players[0]!, players[2]!, players[3]!, players[4]!]) {
      await expect(p.page.getByRole('heading', { name: 'The exercise has ended' })).toBeVisible()
      await expect(p.page.getByText('Thank you all. Hot wash notes go out tomorrow.')).toBeVisible()
    }
    await shot(players[0]!.page, 'ended')
    await shot(players[0]!.page, 'ended', 'dark')
  })

  test('no device talked to anything but the harness', async () => {
    const host = new URL(harness.url).host
    for (const p of players) expect([...p.hosts], p.name).toEqual([host])
  })
})

test.describe('fetch fallback', () => {
  test('a server that refuses WebSockets still serves the exercise over the stream', async ({
    browser,
  }) => {
    const controller = await HarnessController.create({ crypto: createWebCryptoProvider() })
    const harness = await startHarness({ controller, websocket: false })
    const p = await openPlayer(browser, 'fallback', PIXEL, harness.invite('players'))
    try {
      await join(p, /IT Director/)
      await p.page.getByRole('button', { name: 'More' }).click()
      await p.page.getByRole('button', { name: /About/ }).click()
      await expect(p.page.getByText('HTTP streaming')).toBeVisible()
      await controller.release({ title: 'Over the stream', body: 'x' }, ['role:it-director'])
      await p.page.getByRole('button', { name: 'Inbox' }).click()
      await expect(p.page.getByRole('heading', { level: 2, name: /Over the stream/ })).toBeVisible()
      expect(controller.state().roster[0]?.ua?.startsWith('fetch;')).toBe(true)
    } finally {
      await p.context.close()
      await harness.close()
    }
  })
})

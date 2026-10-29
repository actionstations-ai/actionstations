// The Room's numbers (#417) from real devices: the built player page served by the harness, a
// scripted controller, and four devices (Ops, IT, PIO phones and an evaluator laptop). The
// harness controller's roster and received frames are turned into session-log entries, and the
// production dashboard fold and CSV export run over them. Checks delivered / read / acted-on
// counts per inject, the unanswered rule with a fixed clock, Mark answered, and an export with
// no display names. No Electron.
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
import { dashboardView } from '../../src/main/live/dashboard'
import { exportCsvText } from '../../src/main/live/log-export'
import type { SessionLogEntry } from '../../src/shared/schemas/live'

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

const T0 = Date.parse('2026-10-28T13:00:00.000Z')

/** The session log the app would have written for what the harness saw, on a fixed clock. */
function logFromHarness(c: HarnessController, rows: Map<string, string>): SessionLogEntry[] {
  let i = 0
  const at = (sec: number) => new Date(T0 + sec * 1000).toISOString()
  const ref = (clientId: string) =>
    [...c.roster.keys()].indexOf(clientId).toString(16).padStart(8, '0')
  const entries: SessionLogEntry[] = []
  const push = (sec: number, e: Omit<SessionLogEntry, 'i' | 'at'>) =>
    entries.push({ ...e, i: ++i, at: at(sec) } as SessionLogEntry)
  for (const r of c.roster.values()) {
    push(1, {
      kind: 'client.join',
      actor: {
        kind: 'client',
        clientRef: ref(r.clientId),
        seat: { kind: r.kind as 'player', ...(r.roleId ? { roleId: r.roleId } : {}) },
        displayName: r.name,
      },
      data: {},
    })
  }
  let sec = 60
  for (const m of c.received) {
    if (m.type !== 'inject.receipt') continue
    const p = m.payload as { releaseId: string; status: string }
    const rowId = rows.get(p.releaseId)
    const who = c.roster.get(m.from)
    if (!rowId || !who) continue
    push(sec++, {
      kind: 'inject.receipt',
      actor: {
        kind: 'client',
        clientRef: ref(who.clientId),
        seat: { kind: who.kind as 'player', ...(who.roleId ? { roleId: who.roleId } : {}) },
      },
      ref: { rowId, releaseId: p.releaseId },
      data: { status: p.status },
    })
  }
  return entries
}

test.describe('the Room from real devices', () => {
  test.setTimeout(120_000)
  let harness: Harness
  let controller: HarnessController
  const players: Player[] = []

  test.beforeAll(async () => {
    controller = await HarnessController.create({
      crypto: createWebCryptoProvider(),
      scenarioTitle: 'Flight to Nowhere',
      sessionName: 'Room rehearsal',
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

  test('counts, the unanswered rule, Mark answered and a name-free export', async ({ browser }) => {
    const link = harness.invite('players')
    const ops = await open(browser, PIXEL, link)
    await join(ops, /Operations Director/)
    const it = await open(browser, PIXEL, link)
    await join(it, /IT Director/)
    const pio = await open(browser, IPHONE, link)
    await join(pio, /Public Information Officer/)
    const evaluator = await open(
      browser,
      { viewport: { width: 1280, height: 800 } },
      harness.invite('staff', 'evaluator'),
    )
    await join(evaluator, /Evaluator/)
    players.push(ops, it, pio, evaluator)

    const rows = new Map<string, string>()
    rows.set(
      await controller.release(
        {
          mselRowId: 'I-07',
          title: 'Gate system down',
          body: 'Gate B4 display is blank.',
          expectsResponse: true,
        },
        ['role:ops-director', 'role:it-director'],
      ),
      'I-07',
    )
    rows.set(
      await controller.release(
        {
          mselRowId: 'I-08',
          title: 'Reporter call',
          body: 'Channel 5 is asking.',
          expectsResponse: true,
        },
        ['role:pio'],
      ),
      'I-08',
    )
    await expect.poll(() => receipts('delivered')).toBe(3)

    // Ops reads and acts on I-07; IT reads it; PIO leaves I-08 unopened.
    await ops.page.getByRole('button', { name: 'Open Gate system down' }).click()
    await expect.poll(() => receipts('read'), { timeout: 8_000 }).toBe(1)
    await ops.page.getByRole('button', { name: 'Mark as actioned' }).click()
    await expect.poll(() => receipts('actioned')).toBe(1)
    await it.page.getByRole('button', { name: 'Open Gate system down' }).click()
    await expect.poll(() => receipts('read'), { timeout: 8_000 }).toBe(2)

    const entries = logFromHarness(controller, rows)
    const roles = [
      { id: 'ops-director', name: 'Operations Director' },
      { id: 'it-director', name: 'IT Director' },
      { id: 'pio', name: 'Public Information Officer' },
      { id: 'asc', name: 'Airport Security Coordinator' },
    ]
    const releaseAt = (rowId: string) =>
      ({
        kind: 'inject.release',
        actor: { kind: 'controller' },
        ref: { rowId, releaseId: [...rows].find(([, v]) => v === rowId)![0] },
        data: {
          targets: rowId === 'I-07' ? ['role:ops-director', 'role:it-director'] : ['role:pio'],
          expectsResponse: true,
        },
      }) as Omit<SessionLogEntry, 'i' | 'at'>
    // The releases happened a minute in, before any receipt.
    const all = [
      ...entries.filter((e) => e.kind === 'client.join'),
      { ...releaseAt('I-07'), i: 0, at: new Date(T0 + 59_000).toISOString() } as SessionLogEntry,
      { ...releaseAt('I-08'), i: 0, at: new Date(T0 + 59_000).toISOString() } as SessionLogEntry,
      ...entries.filter((e) => e.kind !== 'client.join'),
    ].map((e, k) => ({ ...e, i: k + 1 }))

    const at = (min: number) => ({ roles, now: T0 + min * 60_000, live: true })
    const early = dashboardView(all, at(5))
    const seat = (id: string) => early.roster.find((r) => r.seat === id)!
    expect(seat('ops-director').connected).toBe(1)
    expect(seat('pio').connected).toBe(1)
    expect(seat('asc')).toMatchObject({ connected: 0, empty: true })
    expect(early.evaluation.evaluatorsConnected).toBe(1)
    const i07 = early.injects.find((r) => r.rowId === 'I-07')!
    expect(i07).toMatchObject({
      expected: 2,
      delivered: 2,
      read: 2,
      actioned: 1,
      answered: 'actioned',
    })
    const i08 = early.injects.find((r) => r.rowId === 'I-08')!
    expect(i08).toMatchObject({ expected: 1, delivered: 1, read: 0 })
    expect(early.unanswered).toEqual([])

    // Past the window, the unopened inject is the only unanswered one.
    const late = dashboardView(all, at(12))
    expect(late.unanswered.map((u) => u.rowId)).toEqual(['I-08'])

    // The facilitator marks it answered, and it clears.
    const marked: SessionLogEntry = {
      i: all.length + 1,
      at: new Date(T0 + 13 * 60_000).toISOString(),
      kind: 'inject.answered',
      actor: { kind: 'controller' },
      ref: { rowId: 'I-08', releaseId: [...rows].find(([, v]) => v === 'I-08')![0] },
      data: {},
    }
    expect(dashboardView([...all, marked], at(14)).unanswered).toEqual([])

    // The export has the BOM, the agreed header, and no display names.
    const csv = exportCsvText(all, { includeNames: false })
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('index,at,exercise_time,kind')
    for (const r of controller.roster.values()) if (r.name) expect(csv).not.toContain(r.name)
  })
})

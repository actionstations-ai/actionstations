// Decision-point voting (#414) end to end: the built player page served by the harness, a
// scripted controller wired to the real `Votes` class, and six devices (three ASC, two PIO, one
// evaluator). Checks the ballot (radio group, change until close), the anonymous log, the
// by-role mode with k = 3 folding PIO into Other, the result on devices, a late ballot, and
// that the evaluator gets a notice and no ballot. Screenshots go to .tmp/live/. No Electron.
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
import { VoteDefinition, type SessionLogInput } from '../../src/shared/schemas/live'
import { Votes, type VoteSeat } from '../../src/main/live/votes'

const OUT = resolve('.tmp/live')
mkdirSync(OUT, { recursive: true })

const { defaultBrowserType: _a, ...PIXEL } = devices['Pixel 7']!

interface Player {
  context: BrowserContext
  page: Page
  seat: string
}

const QUESTION = 'Shut down FIDS and go manual, or keep it running?'
const OPTIONS = ['Shut down now', 'Keep running', 'Shut down after the next bank']

async function join(browser: Browser, url: string, seat: RegExp, label: string): Promise<Player> {
  const context = await browser.newContext({ ...PIXEL, colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(url)
  await page.getByRole('radio', { name: seat }).check()
  await page.getByRole('button', { name: 'Join exercise' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
  return { context, page, seat: label }
}

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

/** The vote screen and its result pass axe (WCAG 2.2 AA) in light and dark. */
async function audit(page: Page, name: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    expect(
      results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`),
      `${name} (${scheme}) has axe violations`,
    ).toEqual([])
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

async function cast(p: Player, option: string) {
  const banner = p.page.getByRole('button', { name: /^(Vote now|See your vote): / })
  if (await banner.isVisible()) await banner.click()
  await p.page.getByRole('radio', { name: option }).check()
  await p.page.getByRole('button', { name: /^(Cast|Change) vote$/ }).click()
  await expect(p.page.getByText('Your vote is recorded')).toBeVisible()
}

test.describe('decision-point voting over the harness', () => {
  test.setTimeout(150_000)
  let harness: Harness
  let controller: HarnessController
  let votes: Votes
  const log: SessionLogInput[] = []
  const players: Player[] = []
  let evaluator: Player

  const seats = (): VoteSeat[] =>
    [...controller.roster.values()].map((e) => ({
      clientId: e.clientId,
      kind: e.kind,
      ...(e.roleId ? { roleId: e.roleId } : {}),
      label: e.roleId ?? e.kind,
      online: e.connected,
    }))

  test.beforeAll(async ({ browser }) => {
    controller = await HarnessController.create({
      crypto: createWebCryptoProvider(),
      scenarioTitle: 'Flight to Nowhere',
      sessionName: 'Vote rehearsal',
    })
    harness = await startHarness({ controller })
    votes = new Votes({
      send: async (type, to, payload) => {
        await controller.client.send(type, to, payload as never, { key: 'players' })
      },
      log: { append: async (e) => void log.push(e) },
      seats,
      roleLabel: (id) => id.toUpperCase(),
      now: () => Date.now(),
      changed: () => undefined,
      exerciseTime: async () => '2:14',
    })
    controller.client.on('vote.cast', (m) => void votes.onBallot(m.from, m.seq, m.payload))
    const link = harness.invite('players')
    for (let i = 1; i <= 3; i++)
      players.push(await join(browser, link, /Airport Security Coordinator/, `ASC ${i}`))
    for (let i = 1; i <= 2; i++)
      players.push(await join(browser, link, /Public Information Officer/, `PIO ${i}`))
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    await page.goto(harness.invite('staff', 'evaluator'))
    await page.getByRole('radio', { name: /Evaluator/ }).check()
    await page.getByRole('button', { name: 'Join exercise' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
    evaluator = { context, page, seat: 'Evaluator' }
  })

  test.afterAll(async () => {
    for (const p of [...players, evaluator]) await p?.context.close()
    await harness?.close()
  })

  test('an anonymous vote: five ballots, one change, the log has no device or role', async () => {
    const def = VoteDefinition.parse({
      question: QUESTION,
      options: OPTIONS,
      rationalePrompt: 'Why?',
    })
    const vote = await votes.open(def, { rowId: 'I-14' })

    // The evaluator sees that a vote is going on and has no ballot.
    await expect(evaluator.page.getByText('Vote in progress')).toBeVisible()
    await expect(evaluator.page.getByRole('button', { name: /^Vote now/ })).toHaveCount(0)

    await cast(players[0]!, OPTIONS[0]!)
    await cast(players[1]!, OPTIONS[0]!)
    await cast(players[2]!, OPTIONS[1]!)
    await cast(players[3]!, OPTIONS[1]!)
    await cast(players[4]!, OPTIONS[2]!)
    // ASC 3 changes their mind.
    await cast(players[2]!, OPTIONS[0]!)

    await audit(players[0]!.page, 'vote screen')
    await players[0]!.page.screenshot({ path: resolve(OUT, 'vote-card-light.png') })
    await players[0]!.page.emulateMedia({ colorScheme: 'dark' })
    await players[0]!.page.screenshot({ path: resolve(OUT, 'vote-card-dark.png') })
    await players[0]!.page.emulateMedia({ colorScheme: 'light' })

    await expect
      .poll(async () => (await votes.list())[0]!.options.map((o) => o.count))
      .toEqual([3, 1, 1])
    expect((await votes.list())[0]).toMatchObject({ voted: 5, eligible: 5 })

    await votes.close(vote.voteId)
    for (const p of players) {
      await expect(p.page.getByRole('region', { name: 'Result' })).toBeVisible()
    }
    const result = players[0]!.page.getByRole('region', { name: 'Result' })
    await expect(result.getByText('3 votes, 60 percent')).toBeVisible()
    await expect(result.getByText('5 of 5 voted')).toBeVisible()
    await expect(result.getByText('(Your choice)')).toBeVisible()
    await audit(players[0]!.page, 'vote result')
    await players[0]!.page.screenshot({ path: resolve(OUT, 'vote-result-light.png') })

    const casts = log.filter((e) => e.kind === 'vote.cast')
    expect(casts).toHaveLength(6)
    for (const e of casts) {
      expect(e.actor).toEqual({ kind: 'client' })
      expect(e.data).not.toHaveProperty('role')
      expect(JSON.stringify(e)).not.toMatch(/clientRef|clientId|asc|pio/)
    }
    expect(log.find((e) => e.kind === 'vote.close')!.data).toMatchObject({
      status: 'closed',
      voted: 5,
      eligible: 5,
      results: [
        { optionId: 'o1', count: 3 },
        { optionId: 'o2', count: 1 },
        { optionId: 'o3', count: 1 },
      ],
    })

    const recorded = await votes.markRecorded(vote.voteId, '2:14')
    expect(recorded).toEqual({
      text: 'Shut down now (3 of 5), vote at 2:14',
      rowId: 'I-14',
    })
  })

  test('a by-role vote warns about PIO, and folds it into Other', async () => {
    const scope = votes.scope(['all'], 3)
    expect(scope).toEqual({ eligible: 5, small: [{ roleId: 'pio', devices: 2 }] })

    const def = VoteDefinition.parse({
      question: 'Declare an incident?',
      options: ['Yes', 'No'],
      anonymous: false,
      k: 3,
    })
    const vote = await votes.open(def)
    for (const p of players.slice(0, 3)) await cast(p, 'Yes')
    await cast(players[3]!, 'No')
    await cast(players[4]!, 'No')
    const closed = await votes.close(vote.voteId)
    expect(closed.byRole).toEqual(
      expect.arrayContaining([
        { roleId: 'asc', label: 'ASC', optionId: 'o1', count: 3 },
        { roleId: 'other', label: 'Other', optionId: 'o2', count: 2 },
      ]),
    )
    expect(closed.byRole!.some((r) => r.roleId === 'pio')).toBe(false)
    const roles = log
      .filter((e) => e.kind === 'vote.cast' && e.ref?.voteId === vote.voteId)
      .map((e) => e.data.role)
    expect(roles.sort()).toEqual(['asc', 'asc', 'asc', 'other', 'other'])

    await expect(players[0]!.page.getByRole('region', { name: 'By role' })).toBeVisible()
    await expect(players[3]!.page.getByText('Other: No 2')).toBeVisible()
    await players[3]!.page.screenshot({ path: resolve(OUT, 'vote-byrole-light.png') })
  })

  test('a ballot after the vote closed is not counted and is logged as late', async () => {
    const def = VoteDefinition.parse({ question: 'Last call?', options: ['Yes', 'No'] })
    const vote = await votes.open(def)
    await cast(players[0]!, 'Yes')
    await votes.close(vote.voteId)
    // A device that did not open the vote finds it under More, with its result.
    const other = players[1]!.page
    await other.getByRole('button', { name: 'Back' }).click()
    await other.getByRole('button', { name: 'More' }).click()
    await other.getByRole('button', { name: /^Votes/ }).click()
    await expect(other.getByText('You did not vote.')).toBeVisible()
    const before = log.filter((e) => e.kind === 'anomaly').length
    const first = controller.roster.values().next().value!
    await votes.onBallot(first.clientId, 99_999, { voteId: vote.voteId, optionId: 'o2' })
    expect(log.filter((e) => e.kind === 'anomaly')).toHaveLength(before + 1)
    expect((await votes.list())[0]).toMatchObject({ voted: 1 })
  })
})

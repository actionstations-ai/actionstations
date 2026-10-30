// Cloud preview and approval (#433). The mock provider is marked remote ("treat as cloud"), so
// generation pauses for the approval dialog: approve the documents for the job and it completes;
// cancel from the dialog and the job is cancelled. axe checks the dialog. The network recorders
// confirm nothing left 127.0.0.1 (the mock answers in-process).
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { invoker, launch, type JobState, type Launched } from './helpers'
import { expectLoopbackOnly, netLog } from './net-log'

test.setTimeout(240_000)

let running: Launched | undefined
let electronProcess: ChildProcess | undefined

test.afterAll(async () => {
  await running?.app.close().catch(() => undefined)
  const proc = electronProcess
  if (proc && proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
})

const TASKS = ['ideate', 'draft', 'critique'] as const

/** Settings with one mock provider marked remote and routed to every text task. */
function seedUserData(): string {
  const userData = mkdtempSync(join(tmpdir(), 'ttx-e2e-cloud-'))
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({
      onboardingComplete: true,
      ui: { tips: { enabled: false } },
      updates: { check: 'off' },
      providers: [
        {
          id: 'mock',
          kind: 'mock',
          label: 'Cloud mock',
          defaultModel: 'mock-large',
          options: { network: 'remote' },
          enabled: true,
        },
      ],
      defaultRouting: Object.fromEntries(TASKS.map((t) => [t, { providerId: 'mock' }])),
    }),
  )
  return userData
}

const brief = {
  userPrompt: 'Chief Dana Ruiz reports chlorine dosing faults at the treatment plant',
  audience: ['Operations', 'IT'],
  durationHours: 2,
  phaseCount: 2,
  learningObjectives: [],
  constraints: [],
  startWallClock: '09:00',
}

const dialog = (page: Page) => page.getByRole('dialog', { name: /^Send to Cloud mock/ })

async function jobStatus(page: Page, jobId: string): Promise<string> {
  return (await invoker(page)<JobState>('jobs:get', { jobId })).status
}

/** Approve every request the job asks about until it finishes. */
async function approveUntilDone(page: Page, jobId: string): Promise<void> {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const status = await jobStatus(page, jobId)
    if (['done', 'error', 'cancelled'].includes(status)) return
    const review = page.getByRole('button', { name: 'Review' }).first()
    if (await review.isVisible().catch(() => false)) await review.click()
    const d = dialog(page)
    if (await d.isVisible().catch(() => false)) {
      const docs = d.getByRole('button', { name: 'Send and approve these documents for this job' })
      if (await docs.isVisible().catch(() => false)) await docs.click()
      else await d.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(d).toBeHidden()
    }
    await page.waitForTimeout(250)
  }
  throw new Error('generation did not finish')
}

test('generation pauses for approval, then completes; cancel from the dialog cancels', async () => {
  const net = netLog('cloud')
  running = await launch(
    { TTX_MOCK_PROVIDERS: '1', ...net.env },
    { userData: seedUserData(), args: net.args },
  )
  electronProcess = running.app.process()
  const { page } = running
  const invoke = invoker(page)
  const opened = await invoke<{ path: string }>('examples:open', {
    slug: 'city-water',
    parentDir: mkdtempSync(join(tmpdir(), 'ttx-cloud-proj-')),
  })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // Approve path.
  const first = await invoke<{ jobId: string }>('generate:scenario', {
    projectPath: opened.path,
    brief,
  })
  await expect(page.getByRole('button', { name: 'Review' }).first()).toBeVisible({
    timeout: 60_000,
  })
  await page.getByRole('button', { name: 'Review' }).first().click()
  const d = dialog(page)
  await expect(d).toBeVisible()
  await expect(d).toContainText('leaves your computer')
  await expect(d).toContainText(/Names: \d+ replaced with placeholders/)
  await d.locator('summary').first().click()
  await expect(d.getByText('[name]').first()).toBeVisible()
  const axe = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(
    axe.violations.map(
      (v) => `${v.id}: ${v.help} @ ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([])
  expect(await jobStatus(page, first.jobId)).toBe('running')
  await approveUntilDone(page, first.jobId)
  expect(await jobStatus(page, first.jobId)).toBe('done')

  const log = readFileSync(join(opened.path, 'cloud-sends.jsonl'), 'utf8')
  expect(log.trim().split('\n').length).toBeGreaterThan(1)
  expect(log).not.toContain('Dana Ruiz')

  // Cancel path.
  const second = await invoke<{ jobId: string }>('generate:scenario', {
    projectPath: opened.path,
    brief,
  })
  await page.getByRole('button', { name: 'Review' }).first().click({ timeout: 60_000 })
  await dialog(page).getByRole('button', { name: 'Cancel job' }).click()
  await expect.poll(() => jobStatus(page, second.jobId), { timeout: 30_000 }).toBe('cancelled')
  await expect(dialog(page)).toBeHidden()

  // Leave-out path: one section is taken out, the request is built again with one fewer.
  const third = await invoke<{ jobId: string }>('generate:scenario', {
    projectPath: opened.path,
    brief,
  })
  await page.getByRole('button', { name: 'Review' }).first().click({ timeout: 60_000 })
  const excerptCount = async (): Promise<number> => {
    const text = await dialog(page)
      .getByRole('heading', { name: /^Plan excerpts \(\d+ from/ })
      .textContent()
    return Number(/\((\d+) from/.exec(text ?? '')?.[1])
  }
  const before = await excerptCount()
  expect(before).toBeGreaterThan(1)
  await dialog(page).locator('summary').first().click()
  await dialog(page)
    .getByRole('checkbox', { name: /Leave this section out/ })
    .first()
    .check()
  await dialog(page)
    .getByRole('button', { name: 'Leave out 1 section and review again' })
    .click()
  await page.getByRole('button', { name: 'Review' }).first().click({ timeout: 60_000 })
  await expect(dialog(page)).toBeVisible()
  expect(await excerptCount()).toBe(before - 1)
  await dialog(page).getByRole('button', { name: 'Cancel job' }).click()
  await expect.poll(() => jobStatus(page, third.jobId), { timeout: 30_000 }).toBe('cancelled')

  await running.app.close()
  running = undefined
  expectLoopbackOnly(net.read())
})

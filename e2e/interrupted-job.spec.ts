// An inject job interrupted by an app exit must not lock the deck after a restart (#194, #195):
// the deck shows "Interrupted" with Dismiss instead of a frozen progress banner, Write all /
// Render all stay usable, and Dismiss clears the banner and the jobs tray. The interrupted
// record is seeded into userData/jobs.json the way the app writes it, as the review repro did.
import { expect, test } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { goTo, invoker, launch, type Launched } from './helpers'

test.setTimeout(120_000)

let running: Launched | undefined
let electronProcess: ChildProcess | undefined

test.afterAll(async () => {
  await running?.app.close().catch(() => undefined)
  const proc = electronProcess
  if (proc && proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
})

test('an interrupted inject job leaves the deck usable; Dismiss clears it', async () => {
  running = await launch({ TTX_MOCK_PROVIDERS: '1' })
  electronProcess = running.app.process()
  const invoke = invoker(running.page)
  const opened = await invoke<{ path: string }>('examples:open', {
    slug: 'city-water',
    parentDir: mkdtempSync(join(tmpdir(), 'ttx-interrupt-')),
  })
  const scenarios = await invoke<{ id: string }[]>('scenarios:list', { projectPath: opened.path })
  const scenarioId = scenarios[0]!.id
  const userData = running.userData
  await running.app.close()

  const now = new Date().toISOString()
  writeFileSync(
    join(userData, 'jobs.json'),
    JSON.stringify({
      jobs: [
        {
          id: '01JINTERRUPTED0000000000AA',
          kind: 'generate-injects',
          status: 'running',
          projectPath: opened.path,
          scenarioId,
          progress: 0.4,
          message: 'Writing I-03',
          createdAt: now,
          updatedAt: now,
          resumable: false,
        },
      ],
    }),
  )

  running = await launch({ TTX_MOCK_PROVIDERS: '1' }, { userData })
  electronProcess = running.app.process()
  const { page } = running
  await expect(page.getByRole('heading', { level: 1, name: /Projects/ })).toBeVisible()
  await goTo(page, `#/p/${encodeURIComponent(opened.path)}/scenarios/${scenarioId}?tab=injects`)

  const banner = page.getByRole('region', { name: 'Generation status' })
  await expect(banner).toContainText('Interrupted: writing injects')
  await expect(banner.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Write all injects' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Render all media' })).toBeEnabled()
  const tray = page.getByRole('region', { name: /Background jobs/ })
  await expect(tray).toContainText('interrupted')

  await banner.getByRole('button', { name: 'Dismiss' }).click()
  await expect(banner).toHaveCount(0)
  await expect(tray).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Write all injects' })).toBeEnabled()
  const jobs = await invoker(page)<{ status: string }[]>('jobs:list', { activeOnly: true })
  expect(jobs).toEqual([])
})

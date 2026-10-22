// Quitting while Templates previews are still rendering must exit promptly (#170). Switching
// domain chips queues many render:preview jobs on the hidden render-window pool; app.close()
// right after used to leave the app running until the test timed out.
import { expect, test } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { goTo, invoker, launch } from './helpers'

const CLOSE_BUDGET_MS = 10_000
test.setTimeout(60_000)

let electronProcess: ChildProcess | undefined

test.afterAll(() => {
  // A hung close leaves the process behind; never leave it running.
  const proc = electronProcess
  if (proc && proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
})

test('app.close() during template preview renders finishes promptly', async () => {
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  electronProcess = app.process()
  const created = await invoker(page)<{ path: string }>('project:create', {
    parentDir: mkdtempSync(join(tmpdir(), 'ttx-quit-')),
    name: 'Riverbend Transit',
    orgType: 'transit',
  })
  await goTo(page, `#/p/${encodeURIComponent(created.path)}`)
  await expect(page.getByRole('heading', { level: 1, name: /Riverbend Transit/ })).toBeVisible()

  await goTo(page, '#/templates')
  const domains = page.getByRole('group', { name: 'Domain' })
  await domains.getByRole('button', { name: 'Airport' }).click()
  await domains.getByRole('button', { name: 'All domains' }).click()
  await expect(page.getByText('Rendering…').first()).toBeVisible()

  const started = Date.now()
  const closed = app.close().then(() => Date.now() - started)
  const timedOut = new Promise<number>((resolve) =>
    setTimeout(() => resolve(Number.POSITIVE_INFINITY), CLOSE_BUDGET_MS),
  )
  const elapsed = await Promise.race([closed, timedOut])
  console.log(`[quit-during-render] app.close() took ${elapsed} ms`)
  expect(elapsed).toBeLessThan(CLOSE_BUDGET_MS)
})

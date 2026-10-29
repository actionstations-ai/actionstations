// Controller tools (#428): run the clock at 10x, deliver a MISINFORMATION post and refresh it on
// the presentation screen with its grown counts, then leave an inject unanswered past its
// window, see the tracker flag, mark it answered and read the response time in tracker:report.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch } from './helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

const tweetFields = JSON.parse(
  readFileSync(resolve('templates/injects/tweet/preview.json'), 'utf8'),
) as { fields: Record<string, unknown> }

async function presentPage(app: ElectronApplication): Promise<Page> {
  await expect
    .poll(() => app.windows().filter((w) => w.url().includes('#/present/')).length)
    .toBe(1)
  return app.windows().find((w) => w.url().includes('#/present/'))!
}

test('controller tools: engagement on screen, 10x clock, unanswered tracker', async () => {
  test.setTimeout(150_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-ctl-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'NCIA Controller Tools E2E',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    const scenarioId = empty.id
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: scenarioId, projectId: empty.projectId },
    })
    const created = await invoke<{ id: string }>('injects:create', {
      projectPath,
      scenarioId,
      mselRowId: 'I-06b',
      type: 'tweet',
    })
    await invoke('injects:save', {
      projectPath,
      scenarioId,
      inject: {
        ...created,
        deliveryMode: 'display_main_screen',
        fields: tweetFields.fields,
        engagement: {
          curve: 'surge',
          start: { likes: 12, reposts: 3, replies: 1, views: 400 },
          peak: { likes: 4800, reposts: 900, replies: 230, views: 90000 },
          peakAtMin: 20,
          replies: [],
        },
      },
    })
    await invoke('render:inject', { projectPath, scenarioId, injectId: created.id })

    const key = encodeURIComponent(projectPath)
    await goTo(page, `#/p/${key}/scenarios/${scenarioId}/facilitate`)
    const timeline = page.getByRole('region', { name: 'Timeline' })
    await expect(timeline.locator('.fac-row')).toHaveCount(24)

    // Clock at 10x: the label says so and the clock moves ten times faster than real time.
    await page.getByLabel('Exercise time (H:MM)').fill('1:20')
    await page.getByRole('button', { name: 'Set time', exact: true }).click()
    await page.getByLabel('Rate', { exact: true }).selectOption('10')
    await page
      .getByRole('button', { name: 'Resume', exact: true })
      .or(page.getByRole('button', { name: 'Start', exact: true }))
      .click()
    await expect(page.getByText('Running at 10×')).toBeVisible()
    await expect
      .poll(
        async () => (await page.getByRole('timer', { name: 'Exercise time' }).textContent()) ?? '',
      )
      .toMatch(/^1:2\d:\d\d$/)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()

    // Deliver the post, move the clock on, refresh the presentation window.
    await timeline.getByRole('button', { name: 'Deliver I-06b', exact: true }).click()
    const present = await presentPage(app)
    await present.waitForLoadState('domcontentloaded')
    const before = await present.getByRole('img').getAttribute('src')
    await page.getByRole('button', { name: 'Forward 15 minutes' }).click()
    const panel = page.getByRole('region', { name: 'Engagement for I-06b' })
    await expect(panel.getByText('likes')).toBeVisible()
    await panel.getByRole('button', { name: 'Refresh on screen' }).click()
    await expect
      .poll(async () => present.getByRole('img').getAttribute('src'))
      .toContain('.cache/engagement/')
    expect(before).not.toContain('.cache/engagement/')
    await expect
      .poll(() =>
        present
          .getByRole('img')
          .evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth),
      )
      .toBeGreaterThan(300)
    await present.keyboard.down('Escape')
    await expect
      .poll(() => app.windows().filter((w) => w.url().includes('#/present/')).length)
      .toBe(0)

    // Tracker: I-01 goes out at 0:15 and nobody answers; at 0:40 it is flagged.
    await page.getByLabel('Exercise time (H:MM)').fill('0:15')
    await page.getByRole('button', { name: 'Set time', exact: true }).click()
    // Moving back passes the post delivered at 1:20: the dialog offers to keep it.
    const rewind = page.getByRole('dialog', { name: 'Moving the clock back' })
    await expect(rewind.getByText('I-06b')).toBeVisible()
    await rewind.getByRole('button', { name: 'Keep them delivered' }).click()
    await timeline.getByRole('button', { name: 'Deliver I-01', exact: true }).click()
    await page.getByLabel('Exercise time (H:MM)').fill('0:40')
    await page.getByRole('button', { name: 'Set time', exact: true }).click()
    await page.getByRole('tab', { name: /Tracker/ }).click()
    const open = page.getByRole('list', { name: 'Open items' })
    await expect(open.getByText(/I-01 .*no response for 25 min/)).toBeVisible()
    await open.getByRole('button', { name: 'Mark answered' }).click()
    await page.getByLabel('One line on the answer (optional)').fill('Ops opened a ticket')
    await page
      .getByRole('form', { name: 'Mark answered' })
      .getByRole('button', { name: 'Mark answered' })
      .click()
    await expect(open).toHaveCount(0)

    await expect
      .poll(async () => {
        const report = await invoke<{ responses: { rowId: string; responseMin: number }[] }>(
          'tracker:report',
          { projectPath, scenarioId },
        )
        return report.responses.find((r) => r.rowId === 'I-01')?.responseMin
      })
      .toBe(25)
  } finally {
    await app.close()
  }
})

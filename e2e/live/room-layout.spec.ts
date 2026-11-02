// The Room tab's tables at laptop widths (#566): the Seats and Released injects tables must not
// overlap each other, the page must not scroll sideways (WCAG 1.4.10), and a wide table scrolls
// inside its own container. Runs in the real app with a live session and one released inject.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch } from '../helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

// 960x640 is the app's minimum window size (src/main/index.ts).
const SIZES = [
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 960, height: 640 },
]

interface Box {
  x: number
  y: number
  width: number
  height: number
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element has no box')
  return box
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width - 1 &&
    b.x < a.x + a.width - 1 &&
    a.y < b.y + b.height - 1 &&
    b.y < a.y + a.height - 1
  )
}

// e2e compiles without the DOM lib; declare the two browser globals the probe uses.
declare const document: { documentElement: { scrollWidth: number } }
declare const window: { innerWidth: number }

async function pageScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
}

test('Room tables do not overlap at laptop window widths', async () => {
  test.setTimeout(120_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1', TTX_LIVE_BIND: '127.0.0.1' })
  try {
    page.setDefaultTimeout(15_000)
    await page.setViewportSize(SIZES[0]!)
    const invoke = invoker(page)
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-roomlayout-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'Room Layout E2E',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Room layout',
    })
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: empty.id, projectId: empty.projectId },
    })
    await goTo(page, `#/p/${encodeURIComponent(projectPath)}/scenarios/${empty.id}/facilitate`)
    const timeline = page.getByRole('region', { name: 'Timeline' })
    await expect(timeline).toBeVisible()
    await page.getByRole('tab', { name: 'Live' }).click()
    await page.getByRole('button', { name: 'Start session' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Session running' })).toBeVisible()
    await page.getByLabel('Exercise time (H:MM)').fill('0:15')
    await page.getByRole('button', { name: 'Set time', exact: true }).click()
    await timeline.getByRole('button', { name: 'Deliver I-01', exact: true }).click()

    await page.getByRole('tab', { name: 'Room' }).click()
    const room = page.getByRole('tabpanel', { name: 'Room' })
    const seats = room.getByRole('table', { name: 'Seats' })
    const injects = room.getByRole('table', { name: 'Released injects' })
    await expect(injects).toBeVisible()

    for (const size of SIZES) {
      await page.setViewportSize(size)
      const label = `${size.width}x${size.height}`
      const a = await boxOf(seats)
      const b = await boxOf(injects)
      expect(overlaps(a, b), `Seats and Released injects overlap at ${label}`).toBe(false)
      expect(await pageScrollsSideways(page), `page scrolls sideways at ${label}`).toBe(false)
    }
  } finally {
    await app.close().catch(() => undefined)
  }
})

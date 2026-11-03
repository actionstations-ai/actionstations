// The Facilitate side panel's tab strip at laptop widths (#578): every label stays on one line,
// a tab that does not fit is reachable by scrolling, and the focused tab is fully in view.
import { expect, test, type Locator } from '@playwright/test'
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

function insideHorizontally(inner: Box, outer: Box): boolean {
  return inner.x >= outer.x - 1 && inner.x + inner.width <= outer.x + outer.width + 1
}

// A one-line tab is no taller than its tallest sibling; a wrapped one is about twice as tall.
async function tabHeights(tabs: Locator): Promise<number[]> {
  return tabs.evaluateAll((els) =>
    els.map((el) => (el as unknown as { offsetHeight: number }).offsetHeight),
  )
}

test('Facilitate tabs stay on one line and every tab can be reached', async () => {
  test.setTimeout(120_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1', TTX_LIVE_BIND: '127.0.0.1' })
  try {
    page.setDefaultTimeout(15_000)
    await page.setViewportSize(SIZES[0]!)
    const invoke = invoker(page)
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-factabs-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'Facilitate Tabs E2E',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Facilitate tabs',
    })
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: empty.id, projectId: empty.projectId },
    })
    await goTo(page, `#/p/${encodeURIComponent(projectPath)}/scenarios/${empty.id}/facilitate`)
    const strip = page.getByRole('tablist', { name: 'Facilitator panels' })
    await expect(strip).toBeVisible()
    const tabs = strip.getByRole('tab')
    const count = await tabs.count()
    expect(count).toBeGreaterThan(8)

    for (const size of SIZES) {
      await page.setViewportSize(size)
      const label = `${size.width}x${size.height}`
      const heights = await tabHeights(tabs)
      expect(Math.max(...heights), `a tab label wraps at ${label}`).toBe(Math.min(...heights))

      const stripBox = await boxOf(strip)
      expect(
        stripBox.x + stripBox.width,
        `tab strip runs off the window at ${label}`,
      ).toBeLessThanOrEqual(size.width)
      // Keyboard steps need the window to hold OS focus (another app may have taken it).
      await page.bringToFront()
      await tabs.first().click()
      for (let i = 0; i < count; i++) {
        const focused = tabs.nth(i)
        await expect(focused).toBeFocused()
        const name = (await focused.textContent()) ?? `tab ${i}`
        // The strip scrolls the focused tab into view after focus moves; wait for it to land.
        await expect
          .poll(async () => insideHorizontally(await boxOf(focused), await boxOf(strip)), {
            message: `${name} is clipped when focused at ${label}`,
          })
          .toBe(true)
        await page.keyboard.press('ArrowRight')
      }
    }
  } finally {
    await app.close().catch(() => undefined)
  }
})

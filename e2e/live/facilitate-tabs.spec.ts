// The Facilitate side panel's tab strip at laptop widths (#578): every label stays on one line,
// a tab that does not fit is reachable by scrolling, and the focused tab is fully in view.
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

function insideHorizontally(inner: Box, outer: Box): boolean {
  return inner.x >= outer.x - 1 && inner.x + inner.width <= outer.x + outer.width + 1
}

// A one-line tab is no taller than its tallest sibling; a wrapped one is about twice as tall.
async function tabHeights(tabs: Locator): Promise<number[]> {
  return tabs.evaluateAll((els) =>
    els.map((el) => (el as unknown as { offsetHeight: number }).offsetHeight),
  )
}

/** The element holding focus, for failure messages. */
async function focusedElement(page: Page): Promise<string> {
  // A string expression: this folder's tsconfig has no DOM types.
  return page.evaluate<string>(`(() => {
    const el = document.activeElement
    if (!el) return 'nothing'
    const label = el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 40)
    return '<' + el.tagName.toLowerCase() + ' role=' + el.getAttribute('role') + '> "' + label + '"'
  })()`)
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
      // Arrow keys move between tabs (checked once); each tab, once focused, is scrolled into view.
      await page.bringToFront()
      await tabs.first().click()
      await page.keyboard.press('ArrowRight')
      await expect(
        tabs.nth(1),
        `ArrowRight did not reach tab 2; focus is on ${await focusedElement(page)}`,
      ).toBeFocused()
      for (let i = 0; i < count; i++) {
        const focused = tabs.nth(i)
        await focused.focus()
        const name = (await focused.textContent()) ?? `tab ${i}`
        // The strip scrolls the focused tab into view after focus moves; wait for it to land.
        await expect
          .poll(async () => insideHorizontally(await boxOf(focused), await boxOf(strip)), {
            message: `${name} is clipped when focused at ${label}`,
          })
          .toBe(true)
      }
    }
  } finally {
    await app.close().catch(() => undefined)
  }
})

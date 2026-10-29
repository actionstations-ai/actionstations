// Accessibility audit of the player page (#411, NFR-3): axe-core (WCAG 2.0/2.1/2.2 A + AA) on
// the join, inbox, feed, more, settings, about and ended screens, in light and dark, on a phone
// viewport at 100 % and at 200 % zoom (no horizontal scroll at 320 px), plus a keyboard-only
// join. Reports go to .tmp/live/a11y/.
import AxeBuilder from '@axe-core/playwright'
import { devices, expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createWebCryptoProvider } from '../../src/shared/live/crypto/webcrypto'
import { HarnessController } from '../../src/player/harness/controller'
import { startHarness, type Harness } from '../../src/player/harness/server'

// The probes below run in the page (page.evaluate); e2e compiles without the DOM lib, so
// declare the few browser globals they use, loosely typed, for this file only.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const document: any
declare const window: any
declare const getComputedStyle: (el: any) => any
type HTMLElement = any
/* eslint-enable @typescript-eslint/no-explicit-any */

const OUT = resolve('.tmp/live/a11y')
mkdirSync(OUT, { recursive: true })

const { defaultBrowserType: _ignored, ...PIXEL } = devices['Pixel 7']!
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  writeFileSync(resolve(OUT, `${name}.json`), JSON.stringify(results.violations, null, 2))
  await page.screenshot({ path: resolve(OUT, `${name}.png`) })
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`),
    `${name} has axe violations`,
  ).toEqual([])
}

/** No horizontal scroll and every focusable control at least 24 px tall (2.5.8). */
async function layoutChecks(page: Page, name: string) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement
    const small: string[] = []
    for (const el of document.querySelectorAll('button, a, input, [role=switch]')) {
      if (el.offsetParent === null && el.getAttribute('type') !== 'radio') continue
      const box = el.getBoundingClientRect()
      const target =
        el.getAttribute('type') === 'radio' ? el.parentElement!.getBoundingClientRect() : box
      if (target.height > 0 && (target.height < 24 || target.width < 24))
        small.push(
          `${el.tagName}:${el.textContent?.trim().slice(0, 20)} ${Math.round(target.width)}x${Math.round(target.height)}`,
        )
    }
    return { scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth, small }
  })
  expect(r.scrollWidth, `${name}: horizontal scroll`).toBeLessThanOrEqual(r.innerWidth)
  expect(r.small, `${name}: targets under 24 px`).toEqual([])
}

test.describe('player page accessibility', () => {
  test.setTimeout(240_000)
  let harness: Harness
  let controller: HarnessController

  test.beforeAll(async () => {
    controller = await HarnessController.create({ crypto: createWebCryptoProvider() })
    harness = await startHarness({ controller })
  })
  test.afterAll(async () => {
    await harness.close()
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`every screen passes axe in ${scheme} mode on a phone, at 100 % and 200 %`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ ...PIXEL, colorScheme: scheme })
      const page = await context.newPage()
      const zoomed = async (name: string) => {
        await page.evaluate(() => (document.documentElement.style.zoom = '2'))
        await page.waitForTimeout(100)
        await audit(page, `${name}-${scheme}-200`)
        await layoutChecks(page, `${name}-${scheme}-200`)
        await page.evaluate(() => (document.documentElement.style.zoom = ''))
      }
      const both = async (name: string) => {
        await audit(page, `${name}-${scheme}`)
        await layoutChecks(page, `${name}-${scheme}`)
        await zoomed(name)
      }
      try {
        await page.goto(harness.invite('players'))
        await expect(page.getByRole('group', { name: 'Pick your seat' })).toBeVisible()
        await both('join')

        await page.getByRole('radio', { name: /Operations Director/ }).check()
        await page.getByRole('button', { name: 'Join exercise' }).click()
        await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
        await both('inbox-empty')
        await controller.release(
          {
            title: 'FIDS boards dark',
            body: 'Boards blank in Terminal B.',
            sender: 'Gate agent',
            exerciseTime: '0:45',
          },
          ['role:ops-director'],
        )
        await controller.notice('Hot wash in 10 minutes', { level: 'urgent' })
        await expect(page.getByRole('heading', { level: 2, name: /FIDS/ })).toBeVisible()
        await both('inbox')

        await page.getByRole('button', { name: 'Feed' }).click()
        await expect(page.getByRole('heading', { level: 1, name: 'Feed' })).toBeVisible()
        await both('feed')

        await page.getByRole('button', { name: 'More' }).click()
        await both('more')
        await page.getByRole('button', { name: /Settings/ }).click()
        await both('settings')
        await page.getByRole('button', { name: 'Back' }).click()
        await page.getByRole('button', { name: /About/ }).click()
        await both('about')

        await page.setViewportSize({ width: 320, height: 640 })
        await page.getByRole('button', { name: 'Inbox' }).click()
        await layoutChecks(page, `inbox-${scheme}-320`)
        await page.setViewportSize(PIXEL.viewport!)

        // The kicked device's screen, then the end screen on a fresh device.
        const id = controller.state().roster.find((r) => r.roleId === 'ops-director')!.clientId
        await controller.kick(id)
        await expect(page.getByRole('heading', { name: 'Removed from the exercise' })).toBeVisible()
        await both('removed')
      } finally {
        await context.close()
      }
    })
  }

  test('a player can join with the keyboard alone and the focus order is visible', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } })
    const page = await context.newPage()
    try {
      await page.goto(harness.invite('players'))
      await expect(page.getByRole('group', { name: 'Pick your seat' })).toBeVisible()
      // Tab into the seat list, arrow to IT Director, Tab to the name, type, Enter submits.
      // The screen heading takes focus on load, so the first Tab lands in the seat list.
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
      await page.keyboard.press('Tab')
      const radios = page.getByRole('radio')
      await expect(radios.first()).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await expect(page.getByRole('radio', { name: /IT Director/ })).toBeChecked()
      await page.keyboard.press('Tab')
      await expect(page.getByLabel('Display name (optional)')).toBeFocused()
      await page.keyboard.type('Key Board')
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
      // After the screen change focus is on the heading, and every tab stop shows a focus ring.
      await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeFocused()
      const outlines: string[] = []
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab')
        outlines.push(
          await page.evaluate(() => {
            const el = document.activeElement as HTMLElement
            const s = getComputedStyle(el)
            return `${el.tagName}:${el.textContent?.trim().slice(0, 12)} ${s.outlineStyle} ${s.outlineWidth}`
          }),
        )
      }
      for (const o of outlines) expect(o, 'visible focus').toMatch(/solid [1-9]/)
      expect(controller.state().roster.find((r) => r.roleId === 'it-director')?.name).toBe(
        'Key Board',
      )
      await audit(page, 'room-wide')
    } finally {
      await context.close()
    }
  })

  test('the end screen passes axe', async ({ browser }) => {
    const c2 = await HarnessController.create({ crypto: createWebCryptoProvider() })
    const h2 = await startHarness({ controller: c2 })
    const context = await browser.newContext({ ...PIXEL })
    const page = await context.newPage()
    try {
      await page.goto(h2.invite('players'))
      await page.getByRole('radio', { name: /Observer/ }).check()
      await page.getByRole('button', { name: 'Join exercise' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
      await c2.end('endex', 'Thank you.')
      await expect(page.getByRole('heading', { name: 'The exercise has ended' })).toBeVisible()
      await audit(page, 'ended')
      await layoutChecks(page, 'ended')
    } finally {
      await context.close()
      await h2.close()
    }
  })
})

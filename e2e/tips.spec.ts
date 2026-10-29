// Tip of the day (#443) in the built app: the card shows on Projects, Next tip changes it,
// Turn off tips survives a relaunch, the Settings switch brings it back, the card passes axe in
// both themes, and showing tips sends nothing off this computer.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { rmSync } from 'node:fs'
import { launch } from './helpers'
import { expectLoopbackOnly, netLog } from './net-log'

test.setTimeout(120_000)

const card = (page: Page) => page.getByRole('region', { name: 'Tip' })

async function axeClean(page: Page) {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    const result = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .include('[data-testid="tip-card"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze()
    expect(
      result.violations.map((v) => `[${theme}] ${v.id}: ${v.help}`),
      'axe violations on the tip card',
    ).toEqual([])
  }
}

test('tips show on Projects, advance, turn off for good and come back from Settings', async () => {
  const net = netLog('tips')
  const first = await launch(net.env, { args: net.args, tips: true })
  const { page, userData } = first
  try {
    await expect(card(page)).toBeVisible({ timeout: 20_000 })
    const before = await card(page).locator('p').innerText()
    await card(page).getByRole('button', { name: 'Next tip' }).click()
    await expect(card(page).locator('p')).not.toHaveText(before)
    await expect(card(page).getByRole('button', { name: 'Next tip' })).toBeFocused()
    await expect(card(page).getByRole('link', { name: /^Read: / })).toBeVisible()
    await axeClean(page)

    await card(page).getByRole('button', { name: 'Turn off tips' }).click()
    await expect(card(page)).toHaveCount(0)
    await expect(page.getByText('Turn them on again in Settings.')).toBeVisible()
  } finally {
    await first.app.close()
  }
  expectLoopbackOnly(net.read())

  const second = await launch({}, { userData })
  try {
    await expect(second.page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(card(second.page)).toHaveCount(0)
    await second.page.getByRole('link', { name: 'Settings' }).first().click()
    const box = second.page.getByRole('checkbox', { name: 'Show a tip on the Projects screen' })
    await expect(box).not.toBeChecked()
    await box.click()
    await expect(box).toBeChecked()
    await second.page.getByRole('link', { name: 'Projects' }).first().click()
    await expect(card(second.page)).toBeVisible()
  } finally {
    await second.app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})

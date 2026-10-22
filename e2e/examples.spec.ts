// Example projects in the built app (#169), against the fixture in tests/fixtures/examples
// (TTX_EXAMPLES_DIR): the Projects "Examples" section, "Open a copy" into a chosen folder,
// the banner inside the copy, the index rebuilt on open, a second copy never overwriting the
// first, and the onboarding "Or explore an example" option. Screenshots, light + dark, go to
// .tmp/examples/ (test-results/ is wiped by Playwright).
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch } from './helpers'

test.setTimeout(240_000)
const OUT = resolve('.tmp/examples')
const ENV = { TTX_EXAMPLES_DIR: resolve('tests/fixtures/examples'), TTX_MOCK_PROVIDERS: '1' }
const FOLDER = 'Lakeview-Transit-test-fixture'

async function snap(page: Page, name: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(150)
    await page.screenshot({ path: join(OUT, `${name}-${scheme}.png`), fullPage: true })
    const axe = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze()
    expect(
      axe.violations.map(
        (v) =>
          `${scheme} ${name}: ${v.id} ${v.help} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      ),
    ).toEqual([])
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

test('projects: open a copy of an example, see its notice, index rebuilt', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'ttx-examples-'))
  const { app, page } = await launch(ENV)
  try {
    await invoker(page)('settings:update', { defaultProjectsDir: parent })
    await page.reload()
    await goTo(page, '#/projects')
    const section = page.getByRole('region', { name: 'Examples' })
    const cards = section.locator('li.example-card')
    const card = cards.filter({ hasText: 'Lakeview Transit' })
    await expect(card).toContainText('Transit (bus / rail)')
    await expect(card).toContainText('Fictional')
    await expect(card).toContainText('Ghost buses on the fleet map')
    await expect(card).toContainText('Cyber-physical incident')
    // The fixture with an invalid manifest is not listed.
    await expect(cards).toHaveCount(1)
    await snap(page, 'projects-examples')

    await card.getByRole('button', { name: /Open a copy of Lakeview/ }).click()
    const dialog = page.getByRole('dialog', { name: /Open “Lakeview/ })
    await expect(dialog.getByLabel('Copy into')).toHaveValue(parent)
    await snap(page, 'open-example-dialog')
    await dialog.getByRole('button', { name: 'Copy and open' }).click()

    await expect(page.getByRole('heading', { level: 1, name: /Lakeview Transit/ })).toBeVisible()
    const banner = page.getByTestId('example-banner')
    await expect(banner).toContainText('fictional agency made up for testing')
    const copy = join(parent, `${FOLDER}.ttxproj`)
    expect(existsSync(join(copy, '.example.json'))).toBe(true)
    await expect.poll(() => existsSync(join(copy, 'index.sqlite')), { timeout: 60_000 }).toBe(true)
    await snap(page, 'example-overview')

    // The banner follows into other project screens.
    await page.getByRole('link', { name: 'Documents' }).click()
    await expect(page.getByTestId('example-banner')).toBeVisible()

    // A second copy goes to a new folder; the first is left as it was.
    const before = readFileSync(join(copy, 'project.json'), 'utf8')
    const second = await invoker(page)<{ path: string; project: { name: string } }>(
      'examples:open',
      { slug: 'mini-transit', parentDir: parent },
    )
    expect(second.path).toBe(join(parent, `${FOLDER}-2.ttxproj`))
    expect(second.project.name).toMatch(/\(2\)$/)
    expect(readFileSync(join(copy, 'project.json'), 'utf8')).toBe(before)
  } finally {
    await app.close()
  }
})

test('onboarding: explore an example from the first-project step', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'ttx-examples-ob-'))
  const { app, page } = await launch(ENV, { onboarding: true })
  try {
    await invoker(page)('settings:update', { defaultProjectsDir: parent })
    await page.getByRole('button', { name: 'First project' }).click()
    const examples = page.getByRole('region', { name: 'Or explore an example' })
    await expect(examples.getByText('Lakeview Transit (test fixture)')).toBeVisible()
    await snap(page, 'onboarding-examples')
    await examples.getByRole('button', { name: /Open a copy of Lakeview/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Copy and open' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'You’re set up' })).toBeVisible()
    expect(existsSync(join(parent, `${FOLDER}.ttxproj`, 'project.json'))).toBe(true)
  } finally {
    await app.close()
  }
})

// Domain pickers in the built app (#169): the profile picker in New project and Project
// settings (search, keyboard, legacy orgType note, Customize vocabulary), the threat-family
// choice on the generate brief, and the Templates domain filter. Each screen is checked with
// axe (WCAG A/AA) and captured light + dark in .tmp/domain-ui/ (test-results/ is wiped).
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch, openProjectSettings } from './helpers'

test.setTimeout(300_000)
const OUT = resolve('.tmp/domain-ui')

async function snap(page: Page, name: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(150)
    await page.screenshot({ path: join(OUT, `${name}-${scheme}.png`), fullPage: true })
    const axe = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze()
    const found = axe.violations.map(
      (v) =>
        `${scheme} ${name}: ${v.id} ${v.help} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    )
    expect(found).toEqual([])
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

async function newProjectStep(page: Page, parent: string) {
  await goTo(page, '#/projects')
  await page.getByRole('button', { name: 'New project' }).click()
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await dialog.getByLabel('Project name').fill('Cedar Ridge Dam')
  await dialog.getByLabel('Location').fill(parent)
  const combo = dialog.getByRole('combobox', { name: 'Domain' })
  await expect(dialog.getByRole('option', { selected: true })).toHaveText(/^Generic organization/)
  await combo.fill('dam')
  await expect(dialog.getByRole('option')).toHaveCount(1)
  await combo.press('ArrowDown')
  await expect(dialog.getByRole('option', { selected: true })).toHaveText(/^Dam \/ water/)
  await combo.press('Enter') // must not submit the dialog
  await expect(dialog).toBeVisible()
  await combo.fill('')
  await snap(page, 'new-project-dialog')
  await dialog.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Cedar Ridge Dam/ })).toBeVisible()
  const path = decodeURIComponent(page.url().split('/p/')[1] ?? '')
  const got = await invoker(page)<{ project: { orgType: string } }>('project:get', { path })
  expect(got.project.orgType).toBe('water_dam')
}

async function settingsStep(page: Page, parent: string) {
  const invoke = invoker(page)
  const created = await invoke<{ path: string }>('project:create', {
    parentDir: parent,
    name: 'Mercy General',
    orgType: 'hospital',
  })
  await goTo(page, `#/p/${encodeURIComponent(created.path)}`)
  await openProjectSettings(page)
  await expect(page.getByTestId('orgtype-note')).toHaveText(/Saved as “hospital”.*Healthcare/)
  await expect(page.getByRole('option', { selected: true })).toHaveText(/^Healthcare/)
  await page.getByRole('button', { name: 'Customize vocabulary' }).click()
  const parties = page.getByRole('textbox', { name: 'Outside parties' })
  await parties.fill('County Medical Examiner')
  await parties.press('Enter')
  await expect(page.getByRole('button', { name: /Customize vocabulary/ })).toContainText(
    '1 customized',
  )
  await snap(page, 'project-settings-vocabulary')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Project settings saved')).toBeVisible()
  const got = await invoke<{
    project: { orgType: string; domainProfileOverrides?: { outsideParties?: string[] } }
  }>('project:get', { path: created.path })
  expect(got.project.domainProfileOverrides?.outsideParties).toContain('County Medical Examiner')
}

async function briefStep(page: Page, parent: string) {
  const invoke = invoker(page)
  const created = await invoke<{ path: string }>('project:create', {
    parentDir: parent,
    name: 'Riverbend Transit',
    orgType: 'transit',
  })
  await goTo(page, `#/p/${encodeURIComponent(created.path)}/generate`)
  const family = page.getByRole('group', { name: 'Threat family' })
  await expect(family).toContainText('Suggested: Cyber-physical incident')
  await expect(family).toContainText('default for Transit')
  await page.getByLabel('Threat or theme').fill('A drone hovers over the Northside Depot')
  await expect(family).toContainText('Suggested: UAS / drone incident')
  await expect(family).toContainText('mentions “drone”')
  await snap(page, 'generate-brief-threat')
  await family.getByRole('radio', { name: /Insider threat/ }).check()
  await expect(family.getByRole('radio', { name: /Insider threat/ })).toBeChecked()
}

async function templatesStep(page: Page) {
  await goTo(page, '#/templates')
  const domains = page.getByRole('group', { name: 'Domain' })
  // The last project visited is a transit project.
  await expect(domains.getByRole('button', { name: /Transit/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: /FIDS departures board/ })).toHaveCount(0)
  await snap(page, 'templates-domain')
  await domains.getByRole('button', { name: 'Airport' }).click()
  await expect(page.getByRole('button', { name: /FIDS departures board/ })).toBeVisible()
  await domains.getByRole('button', { name: 'All domains' }).click()
  await expect(page.getByRole('button', { name: /FIDS departures board/ })).toBeVisible()
  // Let the preview renders finish before the app is closed.
  await expect(page.getByText('Rendering…')).toHaveCount(0, { timeout: 120_000 })
}

test('domain pickers: new project, settings, generate brief, templates', async () => {
  mkdirSync(OUT, { recursive: true })
  const parent = mkdtempSync(join(tmpdir(), 'ttx-domui-'))
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  try {
    await test.step('new project dialog', () => newProjectStep(page, parent))
    await test.step('project settings', () => settingsStep(page, parent))
    await test.step('generate brief', () => briefStep(page, parent))
    await test.step('templates gallery', () => templatesStep(page))
  } finally {
    await app.close()
  }
})

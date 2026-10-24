// Prompt library (#23): edit a global override of the fixture prompt, see the diff, reset.
import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launch } from './helpers'

const RESOURCES = resolve('tests/fixtures/prompts/resources')
const NAME = 'fixture_overview'
const SAVE = process.platform === 'darwin' ? 'Meta+S' : 'Control+S'
const DOC_END = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End'
const SELECT_TO_LINE_START = process.platform === 'darwin' ? 'Meta+Shift+ArrowLeft' : 'Shift+Home'

test('edit a global prompt override, see the diff, reset to default', async () => {
  const { app, page, userData } = await launch({ TTX_RESOURCES: RESOURCES })
  const overridePath = join(userData, 'prompts', `${NAME}.md`)
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Prompts' })
    .click()
  await expect(page.getByRole('heading', { name: 'Prompts', level: 1 })).toBeVisible()

  const list = page.getByRole('navigation', { name: 'Prompts by stage' })
  await expect(list.getByRole('heading', { name: 'Scenario overview' })).toBeVisible()
  // The default layer is the core pack included with the app (ADR-0020).
  await expect(list.getByRole('button', { name: new RegExp(NAME) })).toContainText(
    'Included: Action Stations Core',
  )

  const editor = page.getByRole('textbox', { name: new RegExp(NAME) })
  await expect(editor).toHaveValue(/<!-- @system -->/)
  await editor.click()
  await page.keyboard.press(DOC_END)
  await page.keyboard.type('{{shout scenario}}')
  await page.keyboard.press(SAVE)
  const issues = page.getByRole('alert').filter({ hasText: 'Not saved' })
  await expect(issues).toContainText('unknown helper "shout"')
  await expect(issues).toContainText('Line 28')
  expect(existsSync(overridePath)).toBe(false)
  await page.screenshot({ path: 'test-results/prompts-invalid.png', fullPage: true })

  // Replace the bad line with a valid one and save.
  await page.keyboard.press(SELECT_TO_LINE_START)
  await page.keyboard.type('Cite every claim as [C#].')
  await page.keyboard.press(SAVE)
  await expect(page.getByText('Override saved')).toBeVisible()
  expect(readFileSync(overridePath, 'utf8')).toContain('Cite every claim as [C#].')
  await expect(list.getByRole('button', { name: new RegExp(NAME) })).toContainText(
    'Global override',
  )

  const diff = page.getByRole('region', { name: 'Changes vs default' })
  await expect(diff).toContainText('1 added, 0 removed')
  await expect(diff.locator('.prompt-diff__line--add')).toHaveText(
    /\+ Cite every claim as \[C#\]\./,
  )
  await page.screenshot({ path: 'test-results/prompts-diff.png', fullPage: true })

  await page.getByRole('button', { name: 'Reset to default' }).click()
  const dialog = page.getByRole('dialog', { name: `Reset ${NAME}?` })
  await dialog.getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByText('Using default')).toBeVisible()
  await expect(editor).not.toHaveValue(/Cite every claim/)
  expect(existsSync(overridePath)).toBe(false)
  await page.screenshot({ path: 'test-results/prompts-reset.png', fullPage: true })
  await app.close()
})

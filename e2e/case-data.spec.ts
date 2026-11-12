// The Case data tab (#1139): a scenario with the humanitarian toolkit offers that toolkit's
// sources; GDACS asks for its country code, and Check size and terms shows the archive, its host
// and its terms without contacting it (the test never presses Agree, so nothing is fetched).
import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { goTo, invoker, launch } from './helpers'

test('case data: choose a source, fill its options, see size and terms before any request', async () => {
  test.setTimeout(90_000)
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-case-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'Relief Partners',
      orgType: 'humanitarian',
    })
    const { id: scenarioId } = await invoke<{ id: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Aftershock',
    })
    await invoke('toolkits:set-scenario', { projectPath, scenarioId, toolkits: ['humanitarian'] })

    await goTo(page, `#/p/${encodeURIComponent(projectPath)}/scenarios/${scenarioId}`)
    await page.getByRole('tab', { name: 'Case data' }).click()
    await expect(page.getByText('This scenario has no case data yet.')).toBeVisible()

    const source = page.getByRole('combobox', { name: 'Source' })
    await expect(source.getByRole('option', { name: /GDACS/ })).toHaveCount(1)
    await source.selectOption({ label: 'GDACS disaster events for a country and period' })
    await page.getByRole('button', { name: 'Check size and terms' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'is needed' })).toBeVisible()

    await page.getByRole('textbox', { name: /country/i }).fill('TUR')
    await page.getByRole('button', { name: 'Check size and terms' }).click()
    const plan = page.getByRole('region', { name: 'Before anything is requested' })
    await expect(plan).toContainText('www.gdacs.org')
    await expect(plan).toContainText('cite GDACS as the source')
    await expect(plan.getByRole('button', { name: 'Agree and fetch' })).toBeEnabled()
    if (process.env.CASE_DATA_SHOT)
      await page.screenshot({ path: process.env.CASE_DATA_SHOT, fullPage: true })
  } finally {
    await app.close()
  }
})

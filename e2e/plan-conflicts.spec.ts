// Plan conflicts (#423): import the planted conflict corpus (three fictional plans), run the
// plan check from the Documents page with the mock provider, see the five contradictions and the
// missing annex, dismiss one with a note, open a passage in the document's chunks. axe on the
// page, light and dark; screenshots go to .tmp/plan-conflicts/.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch } from './helpers'

const OUT = resolve('.tmp/plan-conflicts')
const CORPUS = resolve('src/main/grounding/fixtures/conflict-corpus')

async function axe(page: Page, name: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(150)
    await page.screenshot({ path: join(OUT, `${name}-${scheme}.png`), fullPage: true })
    const r = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(
      r.violations.map(
        (v) => `${scheme} ${name}: ${v.id} ${v.nodes.map((n) => n.target).join(' ')}`,
      ),
    ).toEqual([])
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

test('plan conflicts: run the check, read both passages, dismiss one, open a passage', async () => {
  test.setTimeout(180_000)
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900),
    )
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-plans-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'Harrow Valley',
    })
    const files = readdirSync(CORPUS).map((f) => join(CORPUS, f))
    await invoke('documents:import', { projectPath, filePaths: files })
    await goTo(page, `#/p/${encodeURIComponent(projectPath)}/documents`)
    const table = page.getByRole('table', { name: 'Project documents' })
    await expect(table.getByText('Indexed')).toHaveCount(files.length, { timeout: 60_000 })

    const section = page.getByRole('region', { name: 'Plan conflicts' })
    await expect(section.getByText(/This project has 3 plans/)).toBeVisible()
    await expect(section.getByLabel('Confirm each conflict with the model')).toBeChecked()
    await expect(
      section.getByText(/runs on this computer, so the passages stay here/),
    ).toBeVisible()
    await section.getByRole('button', { name: 'Check plans for conflicts' }).click()
    const findings = section
      .getByRole('list', { name: 'Plan findings' })
      .getByTestId('plan-finding')
    await expect(findings).toHaveCount(6, { timeout: 60_000 })
    await expect(section.getByRole('status')).toContainText('6 open')
    await expect(
      findings.filter({ hasText: 'Who approves public releases' }).getByRole('blockquote'),
    ).toHaveCount(2)
    await expect(findings.filter({ hasText: 'Annex F' })).toHaveCount(1)
    await axe(page, 'documents-plan-conflicts')

    const phone = findings.filter({ hasText: 'Phone number for Water Quality Manager' })
    await phone.getByLabel('Note (optional)').fill('Annex C contact list is out of date')
    await phone.getByRole('button', { name: 'Not a conflict' }).click()
    await expect(findings).toHaveCount(5)
    await section.getByLabel('Show').selectOption('dismissed')
    await expect(findings).toHaveCount(1)
    await expect(findings.first()).toContainText('Annex C contact list is out of date')
    const onDisk = JSON.parse(readFileSync(join(projectPath, 'plan-conflicts.json'), 'utf8')) as {
      findings: { slot: string; status: string }[]
    }
    expect(onDisk.findings.find((f) => f.slot === 'contact_phone')?.status).toBe('dismissed')

    await section.getByLabel('Show').selectOption('open')
    await findings
      .filter({ hasText: 'Who leads' })
      .getByRole('button', { name: 'Open passage Passage A' })
      .click()
    const detail = page.getByRole('complementary', { name: /^Details for/ })
    await expect(detail.getByRole('tab', { name: /^Chunks/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(detail.locator('.chunk--focus')).toContainText('lead agency')
  } finally {
    await app.close()
  }
})

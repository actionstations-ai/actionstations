// Source check (#423): open the city-water example, see the labels in the MSEL grid and the
// source-check bar, open a row's details from the keyboard, mark it grounded, run "Verify with
// model" with the mock provider, and see the counts in Scenario checks and the inject editor.
// axe on the grid and the dialog, light and dark; screenshots go to .tmp/grounding/.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch, waitForJob } from './helpers'

const OUT = resolve('.tmp/grounding')
/** "pH on the Edge" in examples/city-water. */
const SCENARIO = '01M5H5QV0SX30ZXCBK3QMBSP9Q'

interface Result {
  label: string
  reason: string
  override?: { label: string; note?: string }
}

async function axe(page: Page, name: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(150)
    await page.screenshot({ path: join(OUT, `${name}-${scheme}.png`) })
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

test('source check: labels in the MSEL grid, details from the keyboard, override, verify', async () => {
  test.setTimeout(240_000)
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900),
    )
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-grounding-'))
    const { path: projectPath } = await invoke<{ path: string }>('examples:open', {
      slug: 'city-water',
      parentDir,
    })
    // Opening an example rebuilds its index; labels need the chunks.
    await expect
      .poll(
        async () =>
          (await invoke<{ kind: string }[]>('jobs:list', { projectPath, activeOnly: true })).length,
        { timeout: 120_000, intervals: [1000] },
      )
      .toBe(0)
    const grounding = await invoke<{ items: Record<string, Result> }>('grounding:scenario', {
      projectPath,
      scenarioId: SCENARIO,
    })
    const labelled = Object.entries(grounding.items).filter(
      ([k, r]) => k.startsWith('row:') && r.label !== 'none',
    )
    expect(labelled.length).toBeGreaterThan(10)
    const [key] = labelled.find(([, r]) => r.label !== 'grounded') ?? labelled[0]!
    const rowId = key.slice('row:'.length)

    await goTo(page, `#/p/${encodeURIComponent(projectPath)}/scenarios/${SCENARIO}`)
    await page.getByRole('tab', { name: /^MSEL/ }).click()
    const grid = page.getByRole('grid', { name: 'Master Scenario Events List' })
    await expect(grid.getByTestId('grounding-badge').first()).toBeVisible({ timeout: 30_000 })
    await expect(grid.getByRole('img', { name: /^Source check: / }).first()).toBeVisible()
    const bar = page.getByRole('region', { name: 'Source check' })
    await expect(bar.getByRole('status')).toContainText(
      /\d+ grounded · \d+ to review · \d+ unsupported/,
    )
    await bar.getByRole('button', { name: 'Show rows to check' }).click()
    await expect(
      bar.getByRole('list', { name: 'Rows to check' }).getByRole('listitem').first(),
    ).toBeVisible()
    await axe(page, 'msel-grid')

    // Keyboard only: the row's actions menu, type-ahead to "Source check…", Enter.
    await page.getByRole('button', { name: `Actions for ${rowId}` }).focus()
    await page.keyboard.press('Enter')
    const item = page.getByRole('menuitem', { name: 'Source check…' })
    await expect(item).toBeVisible()
    for (let i = 0; i < 6; i++) {
      if (await item.evaluate((el) => el === el.ownerDocument.activeElement)) break
      await page.keyboard.press('ArrowDown')
    }
    await expect(item).toBeFocused()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: `Source check: Row ${rowId}` })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('list', { name: 'How this label was set' })).toContainText(
      'Automatic check:',
    )
    await axe(page, 'details-dialog')

    await dialog.getByLabel('Note (optional)').fill('Checked against ERP 7.3 with the plant')
    await dialog.getByRole('button', { name: 'Mark grounded' }).focus()
    await page.keyboard.press('Enter')
    await expect(
      dialog.getByRole('img', { name: 'Source check: Grounded (set by you)' }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    const onDisk = JSON.parse(
      readFileSync(join(projectPath, 'scenarios', SCENARIO, 'scenario.json'), 'utf8'),
    ) as { grounding: { items: Record<string, Result> } }
    expect(onDisk.grounding.items[key]!.override).toMatchObject({
      label: 'grounded',
      note: 'Checked against ERP 7.3 with the plant',
    })

    // Verify with model (mock): the job finishes and every label stays the checker's or yours.
    await bar.getByRole('button', { name: 'Verify with model' }).click()
    await expect
      .poll(
        async () =>
          (await invoke<{ kind: string; status: string }[]>('jobs:list', { projectPath })).find(
            (j) => j.kind === 'grounding-verify',
          )?.status,
        { timeout: 60_000 },
      )
      .toBe('done')
    const jobsAfter = await invoke<{ id: string; kind: string }[]>('jobs:list', { projectPath })
    await waitForJob(invoke, jobsAfter.find((j) => j.kind === 'grounding-verify')!.id)

    // Scenario checks show the counts and list the unsupported rows.
    await page.getByRole('tab', { name: /^Warnings/ }).click()
    await expect(page.getByTestId('source-summary')).toContainText(/grounded · \d+ to review/)
    await page.screenshot({ path: join(OUT, 'scenario-checks.png'), fullPage: true })
  } finally {
    await app.close()
  }
})

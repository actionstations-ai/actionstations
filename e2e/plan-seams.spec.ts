// Plan seams (#427): import the planted conflict corpus (three fictional plans), run the plan
// check from the brief's seam picker, pick the State EPA deadline seam, generate with the mock
// provider, see the Seam tag in the MSEL grid, and in facilitator mode see both passages in the
// controller panel but nothing about the seam on the presented screen. axe on the brief form
// in light and dark; screenshots go to .tmp/plan-seams/.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch } from './helpers'

const OUT = resolve('.tmp/plan-seams')
const CORPUS = resolve('src/main/grounding/fixtures/conflict-corpus')
// The deadline seam is tested in phase 1 (FR-5 fallback), where the mock provider writes rows.
const PASSAGE = 'notify the State EPA within 1 hour'

interface Row {
  id: string
  seamId?: string
}

async function axe(page: Page, name: string, include: string) {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(150)
    await page.screenshot({ path: join(OUT, `${name}-${scheme}.png`), fullPage: true })
    const r = await new AxeBuilder({ page })
      .include(include)
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

async function presentPage(app: ElectronApplication): Promise<Page> {
  await expect
    .poll(() => app.windows().filter((w) => w.url().includes('#/present/')).length)
    .toBe(1)
  return app.windows().find((w) => w.url().includes('#/present/'))!
}

test('plan seams: pick a seam, generate, see it in the grid and the controller panel only', async () => {
  test.setTimeout(240_000)
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900),
    )
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-seams-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'Harrow Valley',
    })
    const key = encodeURIComponent(projectPath)
    const files = readdirSync(CORPUS).map((f) => join(CORPUS, f))
    await invoke('documents:import', { projectPath, filePaths: files })
    await goTo(page, `#/p/${key}/documents`)
    const table = page.getByRole('table', { name: 'Project documents' })
    await expect(table.getByText('Indexed')).toHaveCount(files.length, { timeout: 60_000 })

    // The brief offers the plan check, then the seams it found.
    await goTo(page, `#/p/${key}/generate`)
    const brief = page.getByRole('form', { name: 'Scenario brief' })
    const picker = brief.getByRole('group', { name: 'Plan seams to test' })
    await picker.getByRole('button', { name: 'Run plan check' }).click()
    const deadline = picker.getByRole('checkbox', { name: /How soon State EPA must be notified/ })
    await expect(deadline).toBeVisible({ timeout: 60_000 })
    await deadline.check()
    await expect(picker.getByRole('status')).toHaveText('1 of 3 selected.')
    await axe(page, 'brief-seams', '.seam-picker')

    await brief
      .getByLabel('Threat or theme')
      .fill('A loss of treatment at the main plant forces a boil water notice')
    await brief.getByRole('button', { name: 'Generate scenario' }).click()
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Loading…')
    await expect(page.getByRole('region', { name: /^Next: write \d+ injects?$/ })).toBeVisible({
      timeout: 60_000,
    })
    const scenarioId = /\/scenarios\/([^/?]+)/.exec(decodeURIComponent(page.url()))![1]!
    const scenario = await invoke<{ msel: Row[]; seams: { id: string }[] }>('scenarios:get', {
      projectPath,
      scenarioId,
    })
    expect(scenario.seams).toHaveLength(1)
    const seamRow = scenario.msel.find((r) => r.seamId === scenario.seams[0]!.id)!
    expect(seamRow).toBeDefined()

    // The MSEL grid tags the seam row.
    await page.getByRole('tab', { name: /^MSEL/ }).click()
    await expect(page.locator('.msel-editor__seam')).toHaveCount(1)
    await page.screenshot({ path: join(OUT, 'msel-seam-tag.png') })

    // An inject for the row, shown on the main screen.
    const { jobId } = await invoke<{ jobId: string }>('generate:injects', {
      projectPath,
      scenarioId,
      rowIds: [seamRow.id],
    })
    await expect
      .poll(async () => (await invoke<{ status: string }>('jobs:get', { jobId })).status, {
        timeout: 60_000,
      })
      .toBe('done')
    const [inject] = await invoke<{ id: string; mselRowId: string }[]>('injects:list', {
      projectPath,
      scenarioId,
    })
    await invoke('injects:save', {
      projectPath,
      scenarioId,
      inject: { ...inject, deliveryMode: 'display_main_screen' },
    })
    await invoke('render:inject', { projectPath, scenarioId, injectId: inject!.id })

    await goTo(page, `#/p/${key}/scenarios/${scenarioId}/facilitate`)
    const timeline = page.getByRole('region', { name: 'Timeline' })
    await timeline.locator(`.fac-row__main[data-row-id="${seamRow.id}"]`).click()
    const panel = page.getByRole('article', { name: `Inject ${seamRow.id}` })
    await expect(panel.getByText('Plan seam', { exact: true })).toBeVisible()
    const facts = panel.getByRole('region', { name: 'Plan seam' })
    await expect(facts.getByRole('blockquote')).toHaveCount(2)
    await expect(facts).toContainText(PASSAGE)
    await page.screenshot({ path: join(OUT, 'facilitator-seam.png') })

    await timeline.getByRole('button', { name: `Deliver ${seamRow.id}`, exact: true }).click()
    const present = await presentPage(app)
    await present.waitForLoadState('domcontentloaded')
    await expect(present.getByRole('img')).toBeVisible()
    await expect(present.getByText(/plan seam/i)).toHaveCount(0)
    await expect(present.getByText(PASSAGE)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

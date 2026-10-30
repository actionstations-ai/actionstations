// Branching scenarios (#430): add a decision with two branches in the MSEL editor, see a dead
// end flagged and cleared, run the decision in Facilitate (tally, decide by rule, deliver a
// branch row), replay the recorded run, and export the branched MSEL, the workbook and the
// one-path MSEL.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { goTo, invoker, launch } from './helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as { msel: { id: string; purposeTag: string }[] } & Record<string, unknown>

interface Job {
  status: string
  error?: string
  result?: { folder: string; files: string[] }
}

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Axe violations (WCAG A/AA) inside one part of the page. */
async function violations(page: Page, selector: string): Promise<string[]> {
  const r = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .include(selector)
    .withTags(WCAG)
    .analyze()
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`)
}

test('branching: editor, lint, Facilitate decision, replay and exports', async () => {
  test.setTimeout(240_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-branch-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'NCIA Branching E2E',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    const scenarioId = empty.id
    // Scenario 3 has no decision point row; tag I-10 as one.
    const msel = FIXTURE.msel.map((r) =>
      r.id === 'I-10' ? { ...r, purposeTag: 'DECISION_POINT' } : r,
    )
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, msel, id: scenarioId, projectId: empty.projectId },
    })
    const key = encodeURIComponent(projectPath)

    // Editor: branch the decision row, then break and fix a branch.
    await goTo(page, `#/p/${key}/scenarios/${scenarioId}`)
    await page.getByRole('tab', { name: 'MSEL (24)' }).click()
    const panel = page.getByRole('region', { name: 'Branches' })
    await panel.getByRole('button', { name: /Branches/ }).click()
    await panel.getByRole('button', { name: /Branch this decision/ }).click()
    await expect(panel.getByLabel('Rule')).toBeVisible()
    expect(await violations(page, '.branches')).toEqual([])
    await expect(page.locator('.msel-editor__chip').first()).toContainText('Branch B1: Option A')

    const rejoin = panel.getByLabel('Rejoins at').first()
    await rejoin.selectOption({ label: 'Nowhere: ends the exercise' })
    const lint = page.getByRole('region', { name: 'Lint' })
    await expect(lint.getByRole('status')).toContainText('error', { timeout: 15_000 })
    await lint.getByRole('button', { name: /Show details/ }).click()
    await expect(lint.getByText(/neither rejoins/)).toBeVisible()
    await rejoin.selectOption({ value: 'I-10b' })
    await expect(lint.getByText(/neither rejoins/)).toHaveCount(0, { timeout: 15_000 })
    await expect
      .poll(
        async () =>
          (
            await invoke<{ branches?: unknown[]; formatVersion: number }>('scenarios:get', {
              projectPath,
              scenarioId,
            })
          ).formatVersion,
        { timeout: 15_000 },
      )
      .toBe(2)

    // Generate branch rows: the mock model drafts rows for both options; they are only a
    // proposal, so discarding leaves the branches as they were.
    await panel.getByRole('button', { name: 'Generate branch rows' }).first().click()
    const draftRows = panel.getByRole('group', { name: 'Drafted branch rows' })
    await expect(draftRows).toBeVisible({ timeout: 30_000 })
    await expect(draftRows).toContainText('Take the first path')
    expect(await violations(page, '.branches')).toEqual([])
    await draftRows.getByRole('button', { name: 'Discard' }).click()
    await expect(draftRows).toHaveCount(0)

    // Facilitate: reach the decision, tally, decide, deliver a branch row.
    await goTo(page, `#/p/${key}/facilitate`)
    await page.getByRole('link', { name: 'Flight to Nowhere' }).click()
    const timeline = page.getByRole('region', { name: 'Timeline' })
    await expect(timeline.getByText('Branch B1: Option A')).toBeVisible()
    await page.getByLabel('Exercise time (H:MM)').fill('2:30')
    await page.getByRole('button', { name: 'Set time', exact: true }).click()
    await expect(timeline.getByRole('button', { name: 'Deliver I-11', exact: true })).toBeDisabled()
    await timeline.getByRole('button', { name: 'Deliver I-10', exact: true }).click()
    await page.getByRole('tab', { name: 'Decisions' }).click()
    await expect(page.getByRole('button', { name: 'Decide by rule' })).toBeDisabled()
    expect(await violations(page, '.fac-decisions')).toEqual([])
    await page.getByLabel('Option A').fill('5')
    await page.getByLabel('Option B').fill('2')
    await page.getByRole('button', { name: 'Decide by rule' }).click()
    await expect(page.getByRole('list', { name: 'Decisions taken' })).toContainText('Option A')
    // The branch not taken is dimmed and cannot be delivered; the one taken can.
    await expect(timeline.getByRole('button', { name: /^Deliver I-10b-\d+$/ })).toBeDisabled()
    await timeline.getByRole('button', { name: 'Deliver I-10a', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Override…' })).toHaveCount(0)

    await expect
      .poll(async () => {
        await page.getByRole('button', { name: 'Replay check' }).click()
        return page.getByText(/Replay matches/).count()
      })
      .toBe(1)

    // Exports: branched MSEL, workbook, and the path played.
    const outDir = mkdtempSync(join(tmpdir(), 'ttx-branch-out-'))
    const { jobId } = await invoke<{ jobId: string }>('export:run', {
      projectPath,
      scenarioId,
      outDir,
      targets: ['msel_pdf', 'msel_xlsx', 'path_pdf'],
    })
    await expect
      .poll(async () => (await invoke<Job>('jobs:get', { jobId })).status, { timeout: 180_000 })
      .toMatch(/done|error|cancelled/)
    const job = await invoke<Job>('jobs:get', { jobId })
    expect(job.status, job.error).toBe('done')
    const names = readdirSync(job.result!.folder)
    expect(names.some((n) => n.endsWith('-MSEL.pdf'))).toBe(true)
    expect(names.some((n) => n.endsWith('-MSEL-Path.pdf'))).toBe(true)
    const xlsx = names.find((n) => n.endsWith('-MSEL.xlsx'))!
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(join(job.result!.folder, xlsx))
    expect(wb.worksheets.map((w) => w.name)).toEqual(
      expect.arrayContaining(['MSEL', 'Decisions', 'Branch B1 Option A', 'Branch B2 Option B']),
    )
  } finally {
    await app.close()
  }
})

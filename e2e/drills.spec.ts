// Regression drills (#431) with the mock provider: the Scenario 3 fixture with two criteria
// rated not met and partial, a drill drafted from them, its scenario built, the criteria rated
// again in the drill scenario (as the Evaluate panel does), a run recorded, and the results
// shown in the runs table and exported to CSV.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch, waitForJob } from './helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

interface DrillView {
  id: string
  drillScenarioId?: string
  runs: { criteria: { rowId: string; criterionId: string; rating: string }[] }[]
}

test('drills: create from ratings, build, rate again, record and export', async () => {
  test.setTimeout(240_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-drill-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'Drills E2E',
      orgName: 'North Coast Regional Airport Authority',
      orgType: 'airport',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: empty.id, projectId: empty.projectId, documents: {} },
    })
    const rate = (scenarioId: string, id: string, rowId: string, taskId: string, rating: string) =>
      invoke('evaluation:observe', {
        projectPath,
        scenarioId,
        observation: {
          id,
          at: new Date().toISOString(),
          rowId,
          taskId,
          rating,
          note: '',
          source: 'facilitate',
        },
      })
    await rate(empty.id, 'O-1', 'I-06', 'T-07', 'not_met')
    await rate(empty.id, 'O-2', 'I-09', 'T-14', 'partial')

    const key = encodeURIComponent(projectPath)
    await goTo(page, `#/p/${key}/drills?create=1&scenario=${empty.id}`)
    const dialog = page.getByRole('dialog', { name: 'Create a regression drill' })
    await expect(dialog.getByRole('checkbox', { name: /^I-06 1:15/ })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: /^I-09 2:00/ })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: /^I-07 / })).not.toBeChecked()
    await dialog.getByRole('button', { name: 'Create drill' }).click()
    const card = page.getByRole('listitem', { name: /Regression drill/ })
    await expect(card).toBeVisible()

    await card.getByRole('button', { name: 'Build drill scenario' }).click()
    await expect(card.getByRole('link', { name: 'Facilitate' })).toBeVisible({ timeout: 60_000 })
    const [drill] = await invoke<DrillView[]>('drills:list', { projectPath })
    const drillScenarioId = drill!.drillScenarioId!
    const built = await invoke<{ msel: { id: string }[] }>('scenarios:get', {
      projectPath,
      scenarioId: drillScenarioId,
    })
    expect(built.msel.map((r) => r.id)).toEqual(['START', 'I-06', 'TJ-1', 'I-09', 'END'])

    // The drill is played in Facilitate; its criteria are rated in the drill scenario.
    await rate(drillScenarioId, 'D-1', 'I-06', 'T-07', 'met')
    await rate(drillScenarioId, 'D-2', 'I-09', 'T-14', 'met')
    await card.getByRole('button', { name: 'Record run' }).click()
    await expect(card.getByRole('columnheader', { name: 'I-06 T-07' })).toBeVisible()
    await expect(card.getByRole('row').nth(1)).toContainText('Met')
    await expect(card.getByText('Criteria met by run: 100%.')).toBeVisible()

    const axe = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([])
    const outDir = join(parentDir, 'results')
    mkdirSync(outDir)
    const { jobId } = await invoke<{ jobId: string }>('drills:export-results', {
      projectPath,
      id: drill!.id,
      outDir,
    })
    await waitForJob(invoke, jobId, 60_000)
    expect(readFileSync(join(outDir, 'drill-results.csv'), 'utf8')).toContain(
      'Criterion,I-06,T-07,Met',
    )
  } finally {
    await app.close()
  }
})

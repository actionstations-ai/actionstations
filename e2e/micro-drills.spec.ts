// Micro-drills (#437) with the mock provider: a Markdown plan is imported, a drill is built from
// one section on the Micro-drills screen, reviewed and marked Ready, run solo (a wrong answer,
// a hint, a right answer), finished, and the debrief and the run file are checked. The program
// summary is covered in src/main/ipc/handlers/microdrills.test.ts.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { goTo, invoker, launch, waitForJob } from './helpers'

const SENTENCE = 'The PIO may release information after consulting the Incident Commander.'

async function axeViolations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)
}

test('micro-drills: build, review, run solo with a hint, debrief', async () => {
  test.setTimeout(240_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    const work = mkdtempSync(join(tmpdir(), 'ttx-e2e-micro-'))
    const md = join(work, 'Annex.md')
    writeFileSync(md, `## 6.4 Public Information\n\n${SENTENCE}\n`)
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir: work,
      name: 'Micro-drills E2E',
      orgName: 'North Coast Regional Airport Authority',
      orgType: 'airport',
    })
    const imported = await invoke<{ jobId: string }>('documents:import', {
      projectPath,
      filePaths: [md],
    })
    await waitForJob(invoke, imported.jobId, 90_000)

    const key = encodeURIComponent(projectPath)
    await goTo(page, `#/p/${key}/micro-drills`)
    await expect(page.getByRole('heading', { name: 'Micro-drills', level: 1 })).toBeVisible()
    await expect(
      page.getByText(/evidence for short drills with graded hints is thin/),
    ).toBeVisible()
    expect(await axeViolations(page)).toEqual([])

    await page.getByLabel('Plan document').selectOption({ label: 'Annex' })
    const section = page.getByLabel(/Section \(the annex\)/)
    await expect(section.locator('option')).toHaveCount(2)
    await section.selectOption({ index: 1 })
    await page.getByLabel('Questions').selectOption('3')
    await page.getByRole('button', { name: 'Build drill' }).click()

    // The editor opens on the draft; the checks found nothing, so it can be marked Ready.
    await expect(page.getByText('Micro-drill', { exact: true })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/found no problems/)).toBeVisible()
    await expect(page.getByLabel('Level 3 quote from the plan for question 1')).toHaveValue(
      SENTENCE,
    )
    expect(await axeViolations(page)).toEqual([])
    await page.getByRole('button', { name: 'Mark Ready' }).click()
    await page.getByRole('button', { name: 'Back to the drills' }).click()

    // Run: one wrong answer, a hint, a right answer, then the other two questions.
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByRole('note').first()).toContainText('This drill is practice.')
    await page.getByRole('button', { name: 'Start the drill' }).click()
    await expect(
      page.getByText(/Hints are offered after an answer that misses a point/),
    ).toBeVisible()
    await page.getByLabel('Your answer').fill('I would ring my manager.')
    await page.getByRole('button', { name: 'Check my answer' }).click()
    await expect(page.getByText(/A hint is available/)).toBeVisible()
    await page.getByRole('button', { name: 'Show a hint (Level 1)' }).click()
    await expect(page.getByText(/Think about who speaks for the organization/)).toBeVisible()
    await page
      .getByLabel('Your answer')
      .fill('The PIO may release information, after consulting the Incident Commander.')
    await page.getByRole('button', { name: 'Check my answer' }).click()
    await expect(page.getByText('You covered every point for this question.')).toBeVisible()
    expect(await axeViolations(page)).toEqual([])
    await page.getByRole('button', { name: 'Next question' }).click()
    await page
      .getByLabel('Your answer')
      .fill('Agents refer questions to the PIO and do not guess at causes.')
    await page.getByRole('button', { name: 'Check my answer' }).click()
    await page.getByRole('button', { name: 'Next question' }).click()
    await page.getByLabel('Your answer').fill('I do not know.')
    await page.getByRole('button', { name: 'Check my answer' }).click()
    await page.getByRole('button', { name: 'Finish the drill' }).click()

    // Debrief: what was covered and missed, the review line and the notice.
    await expect(
      page.getByRole('heading', { name: 'Public information in the first hour' }),
    ).toBeVisible()
    await expect(page.getByText('Missed').first()).toBeVisible()
    await expect(page.getByText(/^Review: /)).toBeVisible()
    expect(await axeViolations(page)).toEqual([])

    const runs = readdirSync(join(projectPath, 'micro-drill-runs'))
    expect(runs).toHaveLength(1)
    const run = JSON.parse(readFileSync(join(projectPath, 'micro-drill-runs', runs[0]!), 'utf8'))
    expect(run.assessment).toBe('model')
    expect(run.steps[0].hintsUsed).toEqual([1])
    expect(run.steps[0].attempts).toHaveLength(2)
    expect(run.coverage).toBeGreaterThan(0.4)
    expect(run.coverage).toBeLessThan(0.8)
  } finally {
    await app.close()
  }
})

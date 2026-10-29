// Surveys (#422): create the HSEEP Participant Feedback Form from its template, add a
// question, print the form through the export path, type in three paper responses and see the
// results appear once the anonymity threshold (3) is reached. Then the distribution ZIP: the
// participant form is in players/, the results only in facilitator/.
import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch, waitForJob } from './helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>
/** Screenshots for review go to .tmp/surveys/ (outside test-results, which Playwright wipes). */
const OUT = resolve('.tmp/surveys')

/** Every file under a folder, as paths relative to it. */
function walk(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
  )
}

async function enterPaperResponse(page: Page, point: RegExp, change: string) {
  await page
    .getByRole('group', { name: /^1\. The exercise was well structured/ })
    .getByRole('radio', { name: point })
    .check()
  await page
    .getByRole('group', { name: /^9\. What changes would you make/ })
    .getByRole('textbox')
    .fill(change)
  await page.getByRole('button', { name: 'Save response' }).click()
}

test('surveys: build the feedback form, print it, enter paper responses, see results', async () => {
  test.setTimeout(180_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-surveys-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'NCIA Surveys E2E',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    const scenarioId = empty.id
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: scenarioId, projectId: empty.projectId },
    })
    const key = encodeURIComponent(projectPath)

    // From the scenario page to its surveys.
    await goTo(page, `#/p/${key}/scenarios/${scenarioId}`)
    await page.getByRole('link', { name: 'Surveys', exact: true }).click()
    await expect(page.getByText('No surveys yet')).toBeVisible()
    await page.getByRole('button', { name: 'Create Participant Feedback Form' }).click()
    await expect(
      page.getByRole('heading', { name: 'Participant Feedback Form', level: 1 }),
    ).toBeVisible()

    // Add a question to Part III and mark the survey ready; edits save on their own.
    const part3 = page.getByRole('region', { name: 'Section 3' })
    await part3.getByLabel('Question type').selectOption('choice')
    await part3.getByRole('button', { name: 'Add question' }).click()
    const added = part3.getByRole('listitem', { name: 'Question 14' })
    await added.getByLabel('Question', { exact: true }).fill('Which plan should be updated first?')
    await added.getByRole('textbox', { name: 'Option 1' }).fill('TIRP')
    await added.getByRole('textbox', { name: 'Option 2' }).fill('ASP')
    await page.getByLabel('Status').selectOption('ready')
    await expect(page.getByText('All changes saved')).toBeVisible()
    mkdirSync(OUT, { recursive: true })
    await page.screenshot({ path: join(OUT, 'builder.png'), fullPage: true })

    // Preview shows the new question as participants see it.
    await page.getByRole('tab', { name: 'Preview' }).click()
    await expect(
      page.getByRole('group', { name: /14\. Which plan should be updated first/ }),
    ).toBeVisible()

    // Print the form through the export path.
    await page.getByRole('button', { name: 'Deliver…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Deliver this survey' })
    await dialog.getByRole('button', { name: 'Print form' }).click()
    await expect(dialog.getByText(/^Saved in /)).toBeVisible({ timeout: 60_000 })
    const exports = join(projectPath, 'exports')
    const [folder] = readdirSync(exports)
    const forms = walk(join(exports, folder!)).filter((f) => f.startsWith('surveys/'))
    expect(forms).toHaveLength(1)
    expect(forms[0]).toMatch(
      /^surveys\/Flight-to-Nowhere-Survey-Participant-Feedback-Form-\w+\.pdf$/,
    )
    const pdf = readFileSync(join(exports, folder!, forms[0]!))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    writeFileSync(join(OUT, 'form.pdf'), pdf)
    await dialog.getByRole('button', { name: 'Close' }).first().click()

    // Type in three paper forms; details appear once the threshold of 3 is reached.
    await page.getByRole('tab', { name: 'Results' }).click()
    await expect(page.getByText('No responses yet')).toBeVisible()
    await enterPaperResponse(page, /5\s*Strongly agree/, 'More time for the PIO inject')
    await expect(page.getByText('1 response so far')).toBeVisible()
    await enterPaperResponse(page, /4\s*Agree/, 'Start with the FIDS outage')
    await expect(page.getByText('2 responses so far')).toBeVisible()
    await expect(page.getByText(/Details hidden until 3 responses/)).toBeVisible()
    await enterPaperResponse(page, /4\s*Agree/, 'A bigger room')
    await expect(page.getByText('3 responses so far')).toBeVisible()
    await expect(page.getByText(/Details hidden/)).toHaveCount(0)
    const results = page.getByRole('list', { name: 'Results per question' })
    await expect(results.getByText('4.33')).toBeVisible()
    await expect(results.getByText('A bigger room')).toBeVisible()
    await page.locator('.main').evaluate((el) => el.scrollTo(0, 0))
    await page.screenshot({ path: join(OUT, 'results-light.png') })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: join(OUT, 'results-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })

    // The results PDF goes to the export folder; the ZIP keeps it out of players/.
    await page.getByRole('button', { name: 'Save results PDF' }).click()
    await expect
      .poll(() => walk(join(exports, folder!)), { timeout: 60_000 })
      .toContain('Flight-to-Nowhere-Survey-Results.pdf')
    const { jobId } = await invoke<{ jobId: string }>('export:run', {
      projectPath,
      scenarioId,
      outDir: exports,
      targets: ['zip'],
    })
    await waitForJob(invoke, jobId, 120_000)
    const zipName = readdirSync(exports).find((f) => f.endsWith('-distribution.zip'))!
    const zip = await JSZip.loadAsync(readFileSync(join(exports, zipName)))
    const names = Object.keys(zip.files)
    expect(names.some((n) => /^players\/.*-Survey-Participant-Feedback-Form-/.test(n))).toBe(true)
    expect(names).toContain('facilitator/Flight-to-Nowhere-Survey-Results.pdf')
    expect(names.some((n) => n.startsWith('players/') && n.includes('Survey-Results'))).toBe(false)
  } finally {
    await app.close()
  }
})

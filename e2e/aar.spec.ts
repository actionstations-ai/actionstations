// After-Action Report / Improvement Plan (#419) with the mock provider: the Scenario 3 fixture
// with facilitator notes, a hot wash item and a decision captured in Facilitate, the draft job,
// a rating confirmed and an owner typed on the AAR page, then the PDF, Word and tracker sheet
// exports. The mock AarOutput cites note:I-06, note:I-09 and note:general, plus one finding
// resting on a note that was never written; that one must not reach the document.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { goTo, invoker, launch, waitForJob } from './helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>
/** Screenshots for review go to .tmp/aar/ (outside test-results, which Playwright wipes). */
const OUT = resolve('.tmp/aar')

interface AarView {
  capabilities: {
    capability: string
    rating?: string
    areasForImprovement: { correctiveActions: { ownerOrganization: string; dueDate?: string }[] }[]
  }[]
}

async function pdfText(file: string): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise
  const pages: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '))
  }
  return pages.join('\n')
}

async function setTheme(page: Page, colorScheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme })
}

test('AAR/IP: capture in Facilitate, draft, confirm a rating, set an owner, export', async () => {
  test.setTimeout(240_000)
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-aar-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'NCIA AAR E2E',
      orgName: 'North Coast Regional Airport Authority',
      orgType: 'airport',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    const scenarioId = empty.id
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: scenarioId, projectId: empty.projectId, documents: {} },
    })
    // The facilitator's record from the room: the notes the mock draft cites.
    await invoke('facilitator:state-save', {
      projectPath,
      scenarioId,
      state: {
        elapsedMin: 225,
        delivered: { 'I-06': { at: '2026-10-28T14:15:00.000Z', exerciseTime: '1:15' } },
        notes: {
          'I-06': 'Ops kept the FIDS on for 12 minutes before the Go Dark call.',
          'I-09': 'The Go Dark decision was made in the IT room and reached Ops by hallway.',
        },
        generalNotes: 'One decision log was kept at the Ops table from I-02 onwards.',
        hotwash: [],
        decisions: [],
      },
    })
    const key = encodeURIComponent(projectPath)

    // Facilitate: a 3-Up / 3-Down item and a decision, both saved to facilitator.json.
    await setTheme(page, 'light')
    await goTo(page, `#/p/${key}/scenarios/${scenarioId}/facilitate`)
    await expect(page.getByRole('heading', { name: 'Flight to Nowhere', level: 1 })).toBeVisible()
    await page.getByRole('tab', { name: 'Hot wash' }).click()
    const form = page.getByRole('form', { name: 'Add a hot wash item' })
    await form.getByRole('radio', { name: 'To improve' }).check()
    await form.getByLabel('Hot wash item').fill('One voice on the PA once the boards are dark.')
    await form.getByLabel('Inject').selectOption('I-06')
    await form.getByRole('button', { name: 'Add item' }).click()
    await expect(
      page.getByRole('region', { name: 'To improve' }).getByLabel('Hot wash item text'),
    ).toHaveValue(/One voice on the PA/)
    const log = page.getByRole('form', { name: 'Log a decision' })
    await log.getByLabel('Decision').fill('Take the FIDS dark and switch to manual announcements.')
    await log.getByLabel('Decided by').selectOption('ops-director')
    await log.getByLabel('Exercise time (H:MM)').fill('1:20')
    await log.getByRole('button', { name: 'Log decision' }).click()
    await expect(page.locator('.fac-status')).toContainText('Saved')
    await expect
      .poll(async () => {
        const s = await invoke<{ hotwash: unknown[]; decisions: unknown[] }>(
          'facilitator:state-get',
          { projectPath, scenarioId },
        )
        return [s.hotwash.length, s.decisions.length]
      })
      .toEqual([1, 1])
    await page.screenshot({ path: join(OUT, 'light-hotwash-capture.png') })

    // Draft the AAR/IP from the header; the job runs with the mock provider.
    await page.getByRole('button', { name: 'Draft AAR/IP' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Draft', exact: true }).click()
    await expect(page.getByText('After-Action Report / Improvement Plan').first()).toBeVisible({
      timeout: 90_000,
    })
    await expect(page.getByRole('heading', { name: 'Capability ratings' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText('Ratings pending: 2 of 2')).toBeVisible()
    // The unsupported finding was dropped by the mapper; the supported ones are listed.
    await expect(page.getByText('Unsupported finding')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Evidence for Incident command established early' }),
    ).toBeVisible()
    await page.screenshot({ path: join(OUT, 'light-aar.png'), fullPage: true })

    // A person confirms the rating and fills in the Improvement Plan.
    await page
      .getByRole('group', { name: 'Confirmed rating for Operational Coordination' })
      .getByRole('radio', { name: /^S / })
      .check()
    await page
      .getByLabel('Primary responsible organization, row 1')
      .fill('Airport Operations Department')
    await page.getByLabel('Completion date, row 1').fill('2027-01-31')
    await expect
      .poll(async () => {
        const aar = await invoke<AarView | null>('aar:get', { projectPath, scenarioId })
        const c = aar?.capabilities.find((x) => x.capability === 'operational_coordination')
        const action = c?.areasForImprovement[0]?.correctiveActions[0]
        return [c?.rating, action?.ownerOrganization, action?.dueDate]
      })
      .toEqual(['S', 'Airport Operations Department', '2027-01-31'])
    await expect(page.locator('.aar-save')).toHaveText('All changes saved')
    await page
      .getByRole('button', { name: 'Evidence for Incident command established early' })
      .click()
    const drawer = page.getByRole('complementary', { name: 'Evidence' })
    await expect(drawer.getByText(/Ops kept the FIDS on for 12 minutes/)).toBeVisible()
    await setTheme(page, 'dark')
    await page.screenshot({ path: join(OUT, 'dark-aar.png'), fullPage: true })
    await setTheme(page, 'light')

    // The document shows the confirmed rating and "Rating pending" for the other capability.
    const doc = await invoke<{ markdown: string }>('scenarios:doc-get', {
      projectPath,
      scenarioId,
      kind: 'aar',
    })
    expect(doc.markdown).toContain('Appendix A: Improvement Plan')
    expect(doc.markdown).toContain('Airport Operations Department')
    expect(doc.markdown).toContain('Rating pending')
    expect(doc.markdown).not.toContain('Unsupported finding')

    // Export: AAR/IP PDF, the Improvement Plan tracker sheet and the Word copy.
    const outDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-aar-out-'))
    const { jobId } = await invoke<{ jobId: string }>('export:run', {
      projectPath,
      scenarioId,
      outDir,
      targets: ['aar_pdf', 'docx'],
    })
    const job = await waitForJob(invoke, jobId, 120_000)
    const folder = (job.result as { folder: string }).folder
    const files = readdirSync(folder)
    for (const suffix of [
      '-After-Action-Report.pdf',
      '-Improvement-Plan.xlsx',
      '-After-Action-Report.docx',
    ])
      expect(
        files.some((f) => f === `Flight-to-Nowhere${suffix}`),
        suffix,
      ).toBe(true)
    const text = await pdfText(join(folder, 'Flight-to-Nowhere-After-Action-Report.pdf'))
    expect(text).toContain('Improvement Plan')
    expect(text).toContain('Performed with Some Challenges')
    expect(text).toContain('Airport Operations Department')
    expect(text).not.toContain('Unsupported finding')
  } finally {
    await app.close()
  }
})

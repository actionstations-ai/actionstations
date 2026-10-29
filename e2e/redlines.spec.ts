// Plan redlines (#431) with the mock provider: a Word plan and a Markdown plan are imported, an
// AAR/IP area for improvement cites both sections, the proposals are drafted, one is accepted on
// the Redlines screen, and the export is opened: the Word plan gets a copy whose document.xml
// holds w:ins and w:del, the Markdown plan gets a change memo, and the imported original is
// byte-for-byte what it was.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import JSZip from 'jszip'
import { goTo, invoker, launch, waitForJob } from './helpers'

const SENTENCE = 'The PIO may release information after consulting the Incident Commander.'

interface DocView {
  id: string
  filename: string
  status: string
}

test('redlines: draft, accept, export tracked changes and a change memo', async () => {
  test.setTimeout(240_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    const work = mkdtempSync(join(tmpdir(), 'ttx-e2e-redline-'))
    const docx = join(work, 'EOP.docx')
    writeFileSync(
      docx,
      await Packer.toBuffer(
        new Document({
          sections: [
            {
              children: [
                new Paragraph({ text: '6.4 Public Information', heading: HeadingLevel.HEADING_2 }),
                new Paragraph(SENTENCE),
              ],
            },
          ],
        }),
      ),
    )
    const md = join(work, 'Annex.md')
    writeFileSync(md, `## 6.4 Public Information\n\n${SENTENCE}\n`)

    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir: work,
      name: 'Redlines E2E',
      orgName: 'North Coast Regional Airport Authority',
      orgType: 'airport',
    })
    const imported = await invoke<{ jobId: string; documents: DocView[] }>('documents:import', {
      projectPath,
      filePaths: [docx, md],
    })
    await waitForJob(invoke, imported.jobId, 90_000)
    const docs = await invoke<DocView[]>('documents:list', { projectPath })
    expect(docs.every((d) => d.status === 'ok')).toBe(true)
    const word = docs.find((d) => d.filename === 'EOP.docx')!
    const markdown = docs.find((d) => d.filename === 'Annex.md')!
    const original = join(projectPath, 'documents', word.id, 'original.docx')
    const before = createHash('sha256').update(readFileSync(original)).digest('hex')

    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    const chunks = async (documentId: string) =>
      invoke<{ headingPath: string }[]>('documents:chunks', {
        projectPath,
        documentId,
        limit: 50,
        offset: 0,
      })
    const cite = async (d: DocView) => ({
      documentId: d.id,
      documentTitle: d.filename,
      headingPath: (await chunks(d.id))[0]!.headingPath,
    })
    const now = new Date().toISOString()
    await invoke('aar:save', {
      projectPath,
      scenarioId: empty.id,
      aar: {
        createdAt: now,
        updatedAt: now,
        capabilities: [
          {
            capability: 'public_information_and_warning',
            areasForImprovement: [
              {
                id: 'F1',
                title: 'The PIO waited for approval',
                analysisMd: 'The PIO waited 40 minutes for the Incident Commander.',
                citations: [await cite(word), await cite(markdown)],
                evidence: ['obs:O-1'],
                recommendation: 'Name an alternate approver.',
                correctiveActions: [
                  { id: 'CA1', action: 'Name an alternate approver.', element: 'planning' },
                ],
              },
            ],
          },
        ],
      },
    })

    const key = encodeURIComponent(projectPath)
    await goTo(page, `#/p/${key}/redlines?scenario=${empty.id}`)
    await expect(page.getByRole('heading', { name: 'Redlines', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Draft proposals' }).click()
    await expect(page.getByRole('listitem', { name: /Proposed change to/ })).toHaveCount(2, {
      timeout: 60_000,
    })

    // The diff names its changes in text, and the Word plan is marked for tracked changes.
    const card = page.getByRole('listitem', { name: /Proposed change to/ }).first()
    await expect(card.locator('del').first()).toContainText('deleted:')
    await expect(card.locator('ins').first()).toContainText('inserted:')
    const axe = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([])
    await card.getByRole('button', { name: 'Accept' }).click()
    await expect(card.getByText('Accepted', { exact: true })).toBeVisible()

    const all = await invoke<{ id: string; target: { documentId: string }; status: string }[]>(
      'redlines:list',
      { projectPath },
    )
    const ids = all.map((r) => r.id)
    await invoke('redlines:set-status', { projectPath, ids, to: 'accepted', note: '' })
    const outDir = join(work, 'out')
    mkdirSync(outDir)
    const { jobId } = await invoke<{ jobId: string }>('redlines:export', {
      projectPath,
      ids,
      outDir,
      formats: ['docx'],
    })
    await waitForJob(invoke, jobId, 60_000)
    expect(readdirSync(outDir).sort()).toEqual(['Annex-change-memo.docx', 'EOP-redline.docx'])

    const xml = await (
      await JSZip.loadAsync(readFileSync(join(outDir, 'EOP-redline.docx')))
    )
      .file('word/document.xml')!
      .async('string')
    expect(xml).toContain('<w:ins ')
    expect(xml).toContain('<w:del ')
    expect(xml).toContain('w:author="Action Stations"')
    const memo = await (
      await JSZip.loadAsync(readFileSync(join(outDir, 'Annex-change-memo.docx')))
    )
      .file('word/document.xml')!
      .async('string')
    expect(memo).toContain('Current text')

    // The imported plan was only read.
    expect(createHash('sha256').update(readFileSync(original)).digest('hex')).toBe(before)
    const exported = await invoke<{ status: string; export?: { mode: string } }[]>(
      'redlines:list',
      { projectPath },
    )
    expect(exported.map((r) => r.export?.mode).sort()).toEqual(['memo', 'tracked'])
  } finally {
    await app.close()
  }
})

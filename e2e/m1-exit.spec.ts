// M1 exit criterion (docs/08-ROADMAP.md, issue #16): import reference/ncia/*.md and the
// ICS forms into a real project; searching "FIDS failure" returns TIRP 13.6 and AEP
// Appendix 6 with correct heading paths.
import { expect, test } from '@playwright/test'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { invoker, launch } from './helpers'

const files = (dir: string) =>
  readdirSync(resolve(dir))
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(resolve(dir), f))

interface Hit {
  headingPath: string
  documentTitle: string
  score: number
}
interface Doc {
  status: string
  title: string
  chunkCount: number
}

test('NCIA plans + ICS forms: "FIDS failure" retrieves TIRP 13.6 and AEP Appendix 6', async () => {
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-m1-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'North Coast International Airport',
      orgName: 'NCRAA',
      orgType: 'airport',
    })
    const sources = [...files('reference/ncia'), ...files('reference/ics-forms')]
    await invoke('documents:import', { projectPath, filePaths: sources })

    await expect
      .poll(
        async () => (await invoke<Doc[]>('documents:list', { projectPath })).map((d) => d.status),
        {
          timeout: 60_000,
        },
      )
      .toEqual(sources.map(() => 'ok'))
    const docs = await invoke<Doc[]>('documents:list', { projectPath })
    expect(docs).toHaveLength(6)
    for (const d of docs) expect(d.chunkCount, d.title).toBeGreaterThan(0)

    const hits = await invoke<Hit[]>('retrieve:search', {
      projectPath,
      query: 'FIDS failure',
      k: 5,
    })
    const paths = hits.map((h) => h.headingPath)
    console.log('FIDS failure →\n  ' + paths.join('\n  '))
    expect(paths).toContainEqual(expect.stringMatching(/^TIRP › Section 13 › 13\.6 /))
    expect(paths).toContainEqual(expect.stringMatching(/^AEP › Part II › Appendix 6\b/))

    // The same result through the Search screen.
    await page.evaluate((key) => {
      ;(globalThis as unknown as { location: { hash: string } }).location.hash = `#/p/${key}/search`
    }, encodeURIComponent(projectPath))
    await page.getByRole('searchbox').or(page.getByLabel(/query/i)).first().fill('FIDS failure')
    await page.keyboard.press('Enter')
    await expect(
      page.getByText(/13\.6 Scenario C: FIDS \/ BHS System Failure/).first(),
    ).toBeVisible()
    await page.screenshot({ path: 'test-results/m1-exit-search.png', fullPage: true })
  } finally {
    await app.close()
  }
})

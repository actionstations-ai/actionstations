// Spanish player material (spec 0435), end to end with the mock provider: switch Spanish on,
// translate, find the export refused while items are unreviewed, review them, export both
// languages with large print, and read the Spanish PDFs back: document language, tagged
// structure, and the inject words as text.
import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { invoker, launch } from './helpers'

interface Job {
  status: string
  error?: string
  result?: { folder: string; zipPath?: string; files: string[]; warnings: string[] }
}
interface Status {
  items: { kind: string; id: string; label: string; status: string }[]
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise
  const pages: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '))
  }
  return pages.join('\n')
}

test('Spanish player material: translate, review, export with large print', async () => {
  test.setTimeout(240_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  const waitJob = async (jobId: string) => {
    await expect
      .poll(async () => (await invoke<Job>('jobs:get', { jobId })).status, { timeout: 120_000 })
      .toMatch(/done|error|cancelled/)
    return invoke<Job>('jobs:get', { jobId })
  }
  try {
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir: mkdtempSync(join(tmpdir(), 'ttx-tr-e2e-')),
      name: 'Riverbend Utilities',
      orgType: 'generic',
    })
    const { project } = await invoke<{ project: { id: string } }>('project:get', {
      path: projectPath,
    })
    const created = await invoke<{ id: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    const fixture = JSON.parse(readFileSync('tests/fixtures/scenarios/scenario-3.json', 'utf8'))
    const scenarioId = created.id
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...fixture, id: scenarioId, projectId: project.id, documents: {} },
    })
    await invoke('scenarios:doc-save', {
      projectPath,
      scenarioId,
      kind: 'briefing',
      markdown:
        '# Welcome\n\n## Situation\n\nThis is an EXERCISE. Follow the instructions you receive.',
    })
    const recorded = JSON.parse(
      readFileSync('tests/fixtures/injects/sample-run/injects.json', 'utf8'),
    ) as Record<string, unknown>[]
    for (const inject of recorded)
      await invoke('injects:save', {
        projectPath,
        scenarioId,
        inject: { ...inject, assets: [], versions: [] },
      })
    const base = { projectPath, scenarioId, lang: 'es' }

    // A participant survey marked ready joins the translation (#501).
    const { surveys } = await invoke<{ surveys: Record<string, unknown>[] }>(
      'surveys:from-template',
      { projectPath, scenarioId, templateId: 'hseep-participant-feedback' },
    )
    await invoke('surveys:save', {
      projectPath,
      scenarioId,
      survey: { ...surveys[0], status: 'ready' },
    })

    // Switch Spanish on and translate with the mock provider.
    await invoke('translate:set-languages', {
      projectPath,
      scenarioId,
      languages: { player: ['es'], controller: false },
    })
    const before = await invoke<Status>('translate:status', base)
    expect(before.items.length).toBeGreaterThan(1)
    expect(before.items.some((i) => i.kind === 'survey')).toBe(true)
    expect(new Set(before.items.map((i) => i.status))).toEqual(new Set(['missing']))
    const run = await invoke<{ jobId: string }>('translate:run', base)
    const translated = await waitJob(run.jobId)
    expect(translated.status, translated.error).toBe('done')
    expect((translated as { result?: { failed: unknown[] } }).result?.failed).toEqual([])
    const machine = await invoke<Status>('translate:status', base)
    expect(new Set(machine.items.map((i) => i.status))).toEqual(new Set(['machine']))

    // The Languages tab lists every item as needing review.
    const key = encodeURIComponent(projectPath)
    await page.evaluate(
      ([k, id]) => {
        ;(globalThis as unknown as { location: { hash: string } }).location.hash =
          `#/p/${k}/scenarios/${id}?tab=languages`
      },
      [key, scenarioId],
    )
    await expect(page.getByRole('table', { name: /translated items/i })).toBeVisible()
    await expect(page.getByText(/need review before export/)).toBeVisible()

    // Export is refused while items are unreviewed.
    const outDir = mkdtempSync(join(tmpdir(), 'ttx-tr-out-'))
    const refused = await page.evaluate(
      async ([p, id, dir]) =>
        (
          globalThis as unknown as {
            ttx: {
              invoke: (
                c: string,
                r: unknown,
              ) => Promise<{ ok: boolean; error?: { message: string } }>
            }
          }
        ).ttx.invoke('export:run', {
          projectPath: p,
          scenarioId: id,
          outDir: dir,
          targets: ['briefing_pdf'],
          options: { playerLanguages: ['en', 'es'] },
        }),
      [projectPath, scenarioId, outDir],
    )
    expect(refused.ok).toBe(false)
    expect(refused.error?.message).toMatch(/not reviewed yet/)

    // Review everything, then export both languages with large print.
    const { accepted } = await invoke<{ accepted: number }>('translate:accept', base)
    expect(accepted).toBe(machine.items.length)
    const exportJob = await invoke<{ jobId: string }>('export:run', {
      projectPath,
      scenarioId,
      outDir,
      targets: ['zip'],
      options: { playerLanguages: ['en', 'es'], largePrint: true },
    })
    const done = await waitJob(exportJob.jobId)
    expect(done.status, done.error).toBe('done')

    const zip = await JSZip.loadAsync(readFileSync(done.result!.zipPath!))
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir)
    const spanish = names.filter((n) => n.startsWith('players/es/'))
    expect(spanish.map((n) => n.replace(/^.*\//, '')).sort()).toEqual([
      'Flight-to-Nowhere-Player-Briefing-Packet-es-large-print.pdf',
      'Flight-to-Nowhere-Player-Briefing-Packet-es.pdf',
      'Flight-to-Nowhere-Player-Injects-es-large-print.pdf',
      'Flight-to-Nowhere-Player-Injects-es.pdf',
      expect.stringMatching(/^Flight-to-Nowhere-Survey-.*-es\.pdf$/),
    ])
    expect(names).toContain('players/Flight-to-Nowhere-Player-Briefing-Packet-large-print.pdf')
    expect(names.filter((n) => n.startsWith('players/')).join('\n')).not.toMatch(
      /Handbook|MSEL|Deck/,
    )

    // The Spanish PDFs: language, tagged structure, the translated words as text.
    const packet = await zip
      .file('players/es/Flight-to-Nowhere-Player-Briefing-Packet-es.pdf')!
      .async('uint8array')
    const packetRaw = Buffer.from(packet).toString('latin1')
    expect(packetRaw).toContain('/StructTreeRoot')
    expect(packetRaw).toMatch(/\/Lang\s*\(es/)
    expect(await pdfText(packet)).toContain('[es] ')
    const english = await zip
      .file('players/Flight-to-Nowhere-Player-Briefing-Packet.pdf')!
      .async('uint8array')
    expect(Buffer.from(english).toString('latin1')).toMatch(/\/Lang\s*\(en/)

    const injects = await zip
      .file('players/es/Flight-to-Nowhere-Player-Injects-es.pdf')!
      .async('uint8array')
    const injectText = await pdfText(injects)
    expect(Buffer.from(injects).toString('latin1')).toMatch(/\/Lang\s*\(es/)
    expect(injectText).toContain('[es] ')
    expect(injectText).not.toContain('Traducción automática sin revisar')
    // The Spanish survey form: Spanish language tag, tagged structure, translated words.
    const formName = spanish.find((n) => n.includes('-Survey-'))!
    const form = await zip.file(formName)!.async('uint8array')
    const formRaw = Buffer.from(form).toString('latin1')
    expect(formRaw).toContain('/StructTreeRoot')
    expect(formRaw).toMatch(/\/Lang\s*\(es/)
    expect(await pdfText(form)).toContain('[es] ')
    mkdirSync(resolve('.tmp/pdf-a11y'), { recursive: true })
    writeFileSync(join(resolve('.tmp/pdf-a11y'), 'survey-es.pdf'), form)
    // Keep the exported PDFs for scripts/check-pdf-accessibility.mjs (veraPDF, when installed).
    const keep = resolve('.tmp/pdf-a11y')
    mkdirSync(keep, { recursive: true })
    writeFileSync(join(keep, 'briefing-es.pdf'), packet)
    writeFileSync(join(keep, 'briefing-en.pdf'), english)
    writeFileSync(join(keep, 'player-injects-es.pdf'), injects)
    const large = await zip
      .file('players/es/Flight-to-Nowhere-Player-Injects-es-large-print.pdf')!
      .async('uint8array')
    expect(await pdfText(large)).toContain('[es] ')
  } finally {
    await app.close()
  }
})

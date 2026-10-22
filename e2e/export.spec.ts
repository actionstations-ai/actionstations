// Export (#42, #43, #44): the Scenario 3 fixture with injects and media from the mock provider
// is exported to every target; the PDFs, media names, manifest checksums and the
// distribution ZIP tree are checked, and the Export screen is screenshotted (light + dark).
//
// Opt-in companion: LIVE_PROJECT=<project dir> LIVE_SCENARIO=<scenario id> exports a real
// project (e.g. a live inject run with AI images and TTS) into .tmp/export-live for review.
import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { invoker, launch } from './helpers'

const SHOTS = resolve('.tmp/export-shots')

interface Job {
  status: string
  message: string
  error?: string
  result?: { folder: string; zipPath?: string; files: string[]; warnings: string[] }
}
interface Scenario {
  id: string
  projectId: string
  createdAt: string
  updatedAt: string
  msel: { id: string }[]
}

async function waitJob(invoke: ReturnType<typeof invoker>, jobId: string, timeout = 240_000) {
  await expect
    .poll(async () => (await invoke<Job>('jobs:get', { jobId })).status, {
      timeout,
      intervals: [500, 1000],
    })
    .toMatch(/done|error|cancelled/)
  const job = await invoke<Job>('jobs:get', { jobId })
  expect(job.status, job.error).toBe('done')
  return job
}

async function pdfInfo(file: string) {
  const bytes = readFileSync(file)
  const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise
  const first = await doc.getPage(1)
  const [, , w, h] = first.view
  const outline = (await doc.getOutline()) ?? []
  const text = async (n: number) =>
    (await (await doc.getPage(n)).getTextContent()).items
      .map((i) => ('str' in i ? i.str : ''))
      .join(' ')
  return {
    pages: doc.numPages,
    landscape: (w ?? 0) > (h ?? 0),
    // Tagged PDF: a structure tree (headings, tables, figures) for screen readers.
    tagged: bytes.includes('/StructTreeRoot'),
    outline: outline.length,
    text,
  }
}

const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')

async function seedFixtureProject(invoke: ReturnType<typeof invoker>) {
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-export-'))
  const { path: projectPath } = await invoke<{ path: string; project: { id: string } }>(
    'project:create',
    {
      parentDir,
      name: 'North Coast International Airport',
      orgName: 'North Coast Regional Airport Authority',
      orgType: 'airport',
    },
  )
  const { project } = await invoke<{ project: { id: string } }>('project:get', {
    path: projectPath,
  })
  const created = await invoke<Scenario>('scenarios:create-empty', {
    projectPath,
    title: 'Flight to Nowhere',
  })
  const fixture = JSON.parse(readFileSync('tests/fixtures/scenarios/scenario-3.json', 'utf8'))
  const scenario = { ...fixture, id: created.id, projectId: project.id, documents: {} }
  await invoke('scenarios:save', { projectPath, scenario })
  for (const [kind, file] of [
    ['handbook', 'controller-handbook.md'],
    ['briefing', 'player-briefing.md'],
  ] as const) {
    const markdown = readFileSync(join('reference/scenario-3', file), 'utf8')
    await invoke('scenarios:doc-save', { projectPath, scenarioId: created.id, kind, markdown })
  }
  // Inject text from a recorded live run (real template fields for every row); media is then
  // produced by the mock provider (AI images, TTS) and the real templates.
  const recorded = JSON.parse(
    readFileSync('tests/fixtures/injects/sample-run/injects.json', 'utf8'),
  ) as Record<string, unknown>[]
  for (const inject of recorded) {
    await invoke('injects:save', {
      projectPath,
      scenarioId: created.id,
      inject: { ...inject, assets: [], versions: [] },
    })
  }
  const mediaJob = await invoke<{ jobId: string }>('generate:media', {
    projectPath,
    scenarioId: created.id,
  })
  await waitJob(invoke, mediaJob.jobId)
  return { projectPath, scenarioId: created.id, rows: fixture.msel.length as number }
}

async function screenshotBothThemes(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true })
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => {
      const root = (
        globalThis as unknown as {
          document: { documentElement: { setAttribute(n: string, v: string): void } }
        }
      ).document
      root.documentElement.setAttribute('data-theme', t)
    }, theme)
    await page.waitForTimeout(150)
    await page.screenshot({ path: join(SHOTS, `${name}-${theme}.png`), fullPage: true })
  }
}

test('exports Scenario 3 (mock media) to PDFs, media, manifest, DOCX and ZIP', async () => {
  test.setTimeout(10 * 60_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    const { projectPath, scenarioId, rows } = await seedFixtureProject(invoke)
    const preview = await invoke<{ html: string }>('export:preview-html', {
      projectPath,
      scenarioId,
      doc: 'deck',
    })
    expect(preview.html).toContain('Master Inject Deck')
    expect(preview.html).not.toMatch(/<script/i)
    expect(preview.html).toContain('ttx-media://')

    const outDir = mkdtempSync(join(tmpdir(), 'ttx-export-out-'))
    const { jobId } = await invoke<{ jobId: string }>('export:run', {
      projectPath,
      scenarioId,
      outDir,
      targets: ['zip', 'docx'],
    })
    const job = await waitJob(invoke, jobId, 8 * 60_000)
    const folder = job.result!.folder
    const files = readdirSync(folder)
    for (const suffix of [
      '-MSEL.pdf',
      '-Master-Inject-Deck.pdf',
      '-Controller-Evaluator-Handbook.pdf',
      '-Player-Briefing-Packet.pdf',
      '-Exercise-Plan.pdf',
      '-Controller-Evaluator-Handbook.docx',
      '-Player-Briefing-Packet.docx',
    ]) {
      expect(
        files.some((f) => f === `Flight-to-Nowhere${suffix}`),
        suffix,
      ).toBe(true)
    }
    expect(files).toEqual(
      expect.arrayContaining(['scenario.json', 'scenario.md', 'media', 'forms']),
    )

    // Media: S3-<row>-<type>.<ext>, one rendered picture per inject at least.
    const media = readdirSync(join(folder, 'media'))
    expect(media.length).toBeGreaterThanOrEqual(rows)
    for (const m of media) expect(m).toMatch(/^S3-[A-Z0-9a-z]+-[a-z0-9_]+(-[a-z_]+)?(-\d+)?\.\w+$/)
    expect(media).toContain('S3-I02a-helpdesk_ticket.png')

    // Manifest: every media file listed with its real checksum.
    const md = readFileSync(join(folder, 'scenario.md'), 'utf8')
    const listed = [...md.matchAll(/file: (media\/\S+)\n\s+sha256: ([0-9a-f]{64})/g)]
    expect(listed.length).toBe(media.length)
    for (const [, file, hash] of listed) expect(sha(join(folder, file!))).toBe(hash)
    const json = JSON.parse(readFileSync(join(folder, 'scenario.json'), 'utf8'))
    expect(json.scenario.injects.length).toBe(rows)

    // PDFs: landscape MSEL, one deck page per MSEL row, tagged with an outline.
    const msel = await pdfInfo(join(folder, 'Flight-to-Nowhere-MSEL.pdf'))
    expect(msel.landscape).toBe(true)
    expect(msel.tagged).toBe(true)
    expect(await msel.text(1)).toContain('EXERCISE — FOR TRAINING USE')
    const deck = await pdfInfo(join(folder, 'Flight-to-Nowhere-Master-Inject-Deck.pdf'))
    expect(deck.pages).toBeGreaterThanOrEqual(rows + 1)
    expect(deck.outline).toBeGreaterThan(0)
    const briefing = await pdfInfo(join(folder, 'Flight-to-Nowhere-Player-Briefing-Packet.pdf'))
    expect(briefing.pages).toBeGreaterThanOrEqual(5)
    expect(await briefing.text(briefing.pages)).toMatch(/ICS 201/)
    const plan = await pdfInfo(join(folder, 'Flight-to-Nowhere-Exercise-Plan.pdf'))
    expect(plan.pages).toBeGreaterThan(deck.pages + msel.pages)

    // ZIP tree: facilitator/ has everything, players/ only the packet and blank forms.
    const zip = await JSZip.loadAsync(readFileSync(job.result!.zipPath!))
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir)
    const players = names.filter((n) => n.startsWith('players/')).sort()
    expect(players).toEqual([
      'players/Flight-to-Nowhere-Player-Briefing-Packet.pdf',
      'players/ICS-201-Incident-Briefing-blank.pdf',
      'players/ICS-203-Organization-Assignment-List-blank.pdf',
    ])
    expect(names).toEqual(
      expect.arrayContaining([
        'facilitator/Flight-to-Nowhere-MSEL.pdf',
        'facilitator/Flight-to-Nowhere-Master-Inject-Deck.pdf',
        'facilitator/scenario.json',
        'facilitator/scenario.md',
        `facilitator/media/${media[0]}`,
      ]),
    )
    expect(statSync(job.result!.zipPath!).size).toBeGreaterThan(50_000)

    // Export screen: preview, targets, progress, "Show in Finder".
    const key = encodeURIComponent(projectPath)
    const uiOut = mkdtempSync(join(tmpdir(), 'ttx-export-ui-'))
    await page.evaluate(
      ([k, id, dir]) => {
        const g = globalThis as unknown as {
          location: { hash: string }
          localStorage: { setItem(k: string, v: string): void }
        }
        // The folder picker is a native dialog; preset the remembered folder instead.
        g.localStorage.setItem('ttx.export.outDir', dir ?? '')
        g.location.hash = `#/p/${k}/scenarios/${id}/export`
      },
      [key, scenarioId, uiOut],
    )
    await expect(page.getByRole('heading', { level: 1, name: /Flight to Nowhere/ })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /Master Inject Deck/ })).toBeVisible()
    const frame = page.frameLocator('iframe[title^="Preview"]')
    await expect(frame.getByText('Master Scenario Events List (MSEL)').first()).toBeVisible({
      timeout: 20_000,
    })
    await screenshotBothThemes(page, 'export-screen')

    // Deck preview: inject pictures load through ttx-media:// inside the sandboxed frame.
    await page.getByRole('tab', { name: 'Inject Deck' }).click()
    const firstImage = frame.locator('.inject-media img').first()
    await expect(firstImage).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(() =>
        firstImage.evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth),
      )
      .toBeGreaterThan(0)

    // Export from the screen (keyboard): progress, then the result with "Show in Finder".
    await page.getByRole('checkbox', { name: /Distribution ZIP/ }).uncheck()
    await page.getByRole('checkbox', { name: /Exercise Plan/ }).uncheck()
    await page.getByRole('button', { name: 'Export', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: /Show in Finder/ })).toBeVisible({
      timeout: 120_000,
    })
    await expect(page.getByText(/Wrote \d+ files to/)).toBeVisible()
    expect(readdirSync(join(uiOut, 'Flight-to-Nowhere'))).toContain('Flight-to-Nowhere-MSEL.pdf')
    await screenshotBothThemes(page, 'export-done')
    rmSync(outDir, { recursive: true, force: true })
    rmSync(uiOut, { recursive: true, force: true })
  } finally {
    await app.close()
  }
})

const LIVE_PROJECT = process.env.LIVE_PROJECT
const LIVE_SCENARIO = process.env.LIVE_SCENARIO

test('exports a live project for review (opt-in)', async () => {
  test.skip(!LIVE_PROJECT || !LIVE_SCENARIO, 'set LIVE_PROJECT and LIVE_SCENARIO')
  test.setTimeout(10 * 60_000)
  const outDir = resolve(process.env.LIVE_OUT ?? '.tmp/export-live')
  mkdirSync(outDir, { recursive: true })
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    await invoke('project:open', { path: LIVE_PROJECT })
    const started = Date.now()
    const { jobId } = await invoke<{ jobId: string }>('export:run', {
      projectPath: LIVE_PROJECT,
      scenarioId: LIVE_SCENARIO,
      outDir,
      targets: ['zip', 'docx'],
    })
    const job = await waitJob(invoke, jobId, 8 * 60_000)
    console.log(`export done in ${Date.now() - started} ms → ${job.result!.folder}`)
    for (const w of job.result!.warnings) console.log(`warning: ${w}`)
    for (const f of job.result!.files) console.log(f)
  } finally {
    await app.close()
  }
})

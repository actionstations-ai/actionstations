// v0.1 acceptance (#46, docs/01-PRD.md "Success criteria for v1"), opt-in and slow:
//   LIVE=1 pnpm exec playwright test e2e/v01-acceptance.spec.ts
//
// Using only the NCIA plans and the blank ICS forms and the real local stack — LM Studio
// (qwen3-30b-a3b-2507) for text, ComfyUI SDXL for scene photos and LTX-Video for footage,
// mlx-audio for TTS — it generates a new 4-hour cyber-physical scenario that is not about
// FIDS, edits five injects, renders media for every inject (≥ 8, including a TTS phone call,
// an AI scene photo and a video clip with its poster), exports every target including the
// distribution ZIP, and writes .tmp/v01-acceptance/report.json (timings, counts, file tree,
// PDF page counts) plus copies of the PDFs.
//
// Live verification runs entirely in the built app (#107): template rendering (offscreen
// BrowserWindow), AI media, TTS, MP3 encoding and PDF export all happen in the real Electron
// main process, driven over the window.ttx IPC bridge. No Vitest run with a mocked `electron`
// is needed, so the old two-command flow (tests/live/injects.live.test.ts, then
// e2e/injects-render.spec.ts) is no longer required for an end-to-end live check.
import { expect, test } from '@playwright/test'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import JSZip from 'jszip'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { invoker, launch, mdFiles, waitForJob } from './helpers'

test.skip(!process.env.LIVE, 'Live v0.1 acceptance runs only with LIVE=1')
test.setTimeout(90 * 60_000)

const OUT = resolve('.tmp/v01-acceptance')
const LONG = 60 * 60_000
const CONTROL_TAGS = new Set(['STARTEX', 'ENDEX', 'TIME_JUMP'])
const FIDS = /FIDS|flight information/i
const ALL_TARGETS = [
  'msel_pdf',
  'deck_pdf',
  'handbook_pdf',
  'briefing_pdf',
  'exercise_plan_pdf',
  'media',
  'json',
  'markdown',
  'docx',
  'zip',
]

type Invoke = ReturnType<typeof invoker>
interface Citation {
  documentId: string
  headingPath: string
}
interface Idea {
  id: string
  title: string
  hook: string
  systemsAffected: string[]
  sectionsExercised: Citation[]
}
interface Row {
  id: string
  time: string
  event: string
  format?: string
  purposeTag: string
}
interface Scenario {
  id: string
  title: string
  status: string
  durationHours?: number
  phases: { id: string }[]
  msel: Row[]
  warnings: unknown[]
  [k: string]: unknown
}
interface Asset {
  id: string
  kind: string
  role: string
  path: string
  posterPath?: string
  durationSec?: number
}
interface Inject {
  id: string
  mselRowId: string
  type: string
  title: string
  deliveryMode: string
  instructorNote?: string
  fields: Record<string, unknown>
  mediaBrief?: Record<string, unknown>
  assets: Asset[]
  [k: string]: unknown
}
interface ExportResult {
  folder: string
  zipPath?: string
  files: string[]
  warnings: string[]
}

const timings: Record<string, number> = {}
async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  const value = await run()
  timings[label] = Math.round((Date.now() - t0) / 1000)
  console.log(`${label}: ${timings[label]} s`)
  return value
}

async function startJob(invoke: Invoke, channel: string, payload: unknown) {
  const { jobId } = await invoke<{ jobId: string }>(channel, payload)
  return waitForJob(invoke, jobId, LONG, [5000])
}

async function setUpProject(invoke: Invoke) {
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-v01-'))
  const { path: projectPath } = await invoke<{ path: string }>('project:create', {
    parentDir,
    name: 'North Coast International Airport',
    orgName: 'North Coast Regional Airport Authority',
    orgType: 'airport',
  })
  await invoke('project:update', {
    path: projectPath,
    patch: {
      brand: {
        city: 'Akron',
        region: 'Summit County, Ohio',
        aliases: { org: 'North Coast International Airport', orgShort: 'NCIA' },
      },
    },
  })
  const docs = [...mdFiles('reference/ncia'), ...mdFiles('reference/ics-forms')]
  await invoke('documents:import', { projectPath, filePaths: docs })
  await expect
    .poll(
      async () =>
        (await invoke<{ status: string }[]>('documents:list', { projectPath })).every(
          (d) => d.status === 'ok',
        ),
      { timeout: 120_000 },
    )
    .toBe(true)
  return { projectPath, documents: docs.length }
}

async function configureProviders(invoke: Invoke) {
  const upsert = async (config: Record<string, unknown>) =>
    (
      await invoke<{ id: string }>('providers:upsert', {
        config: { options: {}, enabled: true, ...config },
      })
    ).id
  const lm = await upsert({
    kind: 'openai-compatible',
    label: 'LM Studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    defaultModel: process.env.LIVE_MODEL ?? 'qwen3-30b-a3b-2507',
  })
  const comfy = await upsert({
    kind: 'comfyui',
    label: 'ComfyUI',
    baseUrl: 'http://127.0.0.1:8188',
  })
  const ttsModel = 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16'
  const tts = await upsert({
    kind: 'openai-compatible',
    label: 'Local TTS (mlx-audio)',
    baseUrl: 'http://127.0.0.1:8765',
    defaultModel: ttsModel,
    options: { ttsModel },
  })
  for (const id of [lm, comfy, tts]) {
    const h = await invoke<{ ok: boolean; message?: string }>('providers:health', { id })
    expect(h.ok, `${id}: ${h.message}`).toBe(true)
  }
  await invoke('routing:set', {
    scope: 'global',
    routing: {
      ideate: { providerId: lm },
      draft: { providerId: lm },
      critique: { providerId: lm },
      image: { providerId: comfy },
      video: { providerId: comfy },
      audio: { providerId: tts },
    },
  })
}

const ideaText = (i: Idea) => `${i.title} ${i.hook} ${i.systemsAffected.join(' ')}`

async function generateScenario(invoke: Invoke, projectPath: string) {
  await timed('ideas', () => startJob(invoke, 'generate:ideas', { projectPath, count: 6 }))
  const ideas = await invoke<Idea[]>('generate:ideas-result', { projectPath })
  writeFileSync(join(OUT, 'ideas.json'), JSON.stringify(ideas, null, 2))
  const idea = ideas.find((i) => !FIDS.test(ideaText(i)))
  expect(idea, 'every idea is about FIDS').toBeTruthy()
  console.log(`Developing: ${idea!.title}`)
  const { jobId, scenarioId } = await invoke<{ jobId: string; scenarioId: string }>(
    'generate:scenario',
    {
      projectPath,
      idea,
      brief: {
        userPrompt: `${idea!.hook} A cyber-physical incident; the flight information display system (FIDS) is not involved.`,
        audience: ['Airport Operations', 'IT/Cybersecurity', 'Public Safety', 'Public Information'],
        durationHours: 4,
        phaseCount: 4,
        learningObjectives: [],
        constraints: [
          'Include one red herring and one noise inject per phase',
          'Include a PIO track',
        ],
        startWallClock: '09:00',
      },
    },
  )
  await timed('scenario', () => waitForJob(invoke, jobId, LONG, [5000]))
  return { idea: idea!, ideas: ideas.length, scenarioId }
}

/** Formats a user would set in the MSEL editor when the model left them out. */
async function ensureMediaRows(invoke: Invoke, projectPath: string, scenarioId: string) {
  const s = await invoke<Scenario>('scenarios:get', { projectPath, scenarioId })
  const playable = s.msel.filter((r) => !CONTROL_TAGS.has(r.purposeTag))
  const edits: string[] = []
  const free = (r: Row) => !edits.some((e) => e.startsWith(`${r.id}:`))
  const claim = (format: string, prefer: RegExp) => {
    if (playable.some((r) => r.format === format)) return
    const row =
      playable.find((r) => free(r) && prefer.test(r.event)) ?? playable.find((r) => free(r))!
    edits.push(`${row.id}: ${row.format ?? '—'} → ${format}`)
    row.format = format
  }
  claim('phone_call', /\b(call|calls|phone)\b/i)
  claim('scene_photo', /\b(photo|crowd|queue|smoke|scene)\b/i)
  // The video row: social_video has no template, so it renders as a clip from the AI still.
  const videoRow = playable.find(
    (r) => free(r) && !['phone_call', 'scene_photo'].includes(r.format ?? ''),
  )!
  edits.push(`${videoRow.id}: ${videoRow.format ?? '—'} → social_video`)
  videoRow.format = 'social_video'
  await invoke('scenarios:save', { projectPath, scenario: s, note: 'Acceptance: media formats' })
  return { edits, videoRowId: videoRow.id }
}

/** Five edits a facilitator would make; IPC saves record them as user versions. */
async function editFiveInjects(
  invoke: Invoke,
  projectPath: string,
  scenarioId: string,
  videoRowId: string,
) {
  const injects = await invoke<Inject[]>('injects:list', { projectPath, scenarioId })
  const save = (inject: Inject) => invoke('injects:save', { projectPath, scenarioId, inject })
  const edited: string[] = []
  const video = injects.find((i) => i.mselRowId === videoRowId)!
  await save({
    ...video,
    type: 'social_video',
    deliveryMode: 'display_main_screen',
    title: 'Bystander video from the terminal',
    mediaBrief: {
      // social_video plans only ai_video, but image-to-video needs a still: ask for both.
      paths: ['ai_image', 'ai_video'],
      imagePrompt:
        'Phone video still of a crowded airport terminal concourse at ground level, travellers with rolling suitcases, security officers walking past, daylight from tall windows',
      videoPrompt:
        'Handheld phone footage, travellers walk through the airport concourse, officers move through the crowd',
      imageStyle: 'phone',
      durationSec: 3,
    },
  })
  edited.push(`${video.mselRowId}: type → social_video (video clip)`)
  const others = injects
    .filter((i) => i.mselRowId !== videoRowId && !/_card$/.test(i.type))
    .slice(0, 4)
  for (const inject of others) {
    await save({
      ...inject,
      title: `${inject.title} (reviewed)`,
      instructorNote:
        `${inject.instructorNote ?? ''} Facilitator: watch who escalates first.`.trim(),
    })
    edited.push(`${inject.mselRowId}: title + instructor note`)
  }
  return edited
}

function mediaCounts(injects: Inject[]) {
  const assets = injects.flatMap((i) =>
    i.assets.map((a) => ({ ...a, row: i.mselRowId, type: i.type })),
  )
  return {
    injects: injects.length,
    injectsWithMedia: injects.filter((i) => i.assets.length > 0).length,
    templateRenders: assets.filter((a) => a.kind === 'image' && a.role !== 'generated').length,
    aiImages: assets.filter((a) => a.kind === 'image' && a.role === 'generated').length,
    aiImageRows: injects
      .filter((i) => i.assets.some((a) => a.kind === 'image' && a.role === 'generated'))
      .map((i) => `${i.mselRowId}: ${i.type}`),
    audio: assets
      .filter((a) => a.kind === 'audio')
      .map((a) => `${a.row} ${a.type} ${a.durationSec?.toFixed(1)} s`),
    phoneCallAudio: injects.filter(
      (i) => i.type === 'phone_call' && i.assets.some((a) => a.kind === 'audio'),
    ).length,
    video: assets
      .filter((a) => a.kind === 'video')
      .map((a) => ({ row: a.row, path: a.path, poster: a.posterPath })),
    types: injects.map((i) => `${i.mselRowId}: ${i.type}`),
  }
}

function fileTree(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const full = join(e.parentPath, e.name)
      return `${relative(dir, full)} (${Math.round(statSync(full).size / 1024)} KB)`
    })
    .sort()
}

async function pdfPages(folder: string) {
  mkdirSync(join(OUT, 'pdfs'), { recursive: true })
  const pages: Record<string, number> = {}
  for (const f of readdirSync(folder).filter((n) => n.endsWith('.pdf'))) {
    const doc = await getDocument({
      data: new Uint8Array(readFileSync(join(folder, f))),
      verbosity: 0,
    }).promise
    pages[f] = doc.numPages
    copyFileSync(join(folder, f), join(OUT, 'pdfs', f))
  }
  return pages
}

async function zipTree(zipPath: string) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath))
  return Object.keys(zip.files)
    .filter((n) => !zip.files[n]!.dir)
    .sort()
}

test('v0.1 acceptance: NCIA plans → new non-FIDS 4-hour scenario → media → export', async () => {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const started = Date.now()
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    const { projectPath, documents } = await timed('import', () => setUpProject(invoke))
    await configureProviders(invoke)
    const { idea, ideas, scenarioId } = await generateScenario(invoke, projectPath)
    const formatEdits = await ensureMediaRows(invoke, projectPath, scenarioId)
    await timed('injectText', () =>
      startJob(invoke, 'generate:injects', { projectPath, scenarioId }),
    )
    const injectEdits = await editFiveInjects(
      invoke,
      projectPath,
      scenarioId,
      formatEdits.videoRowId,
    )
    await timed('media', () => startJob(invoke, 'generate:media', { projectPath, scenarioId }))

    const scenario = await invoke<Scenario>('scenarios:get', { projectPath, scenarioId })
    const injects = await invoke<Inject[]>('injects:list', { projectPath, scenarioId })
    const counts = mediaCounts(injects)
    writeFileSync(join(OUT, 'scenario.json'), JSON.stringify(scenario, null, 2))
    writeFileSync(join(OUT, 'injects.json'), JSON.stringify(injects, null, 2))

    const outDir = join(OUT, 'export')
    mkdirSync(outDir, { recursive: true })
    const exported = await timed('export', () =>
      startJob(invoke, 'export:run', { projectPath, scenarioId, outDir, targets: ALL_TARGETS }),
    )
    const result = exported.result as ExportResult
    const tree = fileTree(result.folder)
    const media = readdirSync(join(result.folder, 'media'))
    const wavs = media.filter((m) => m.endsWith('.wav'))
    const report = {
      at: new Date().toISOString(),
      totalSecs: Math.round((Date.now() - started) / 1000),
      timings,
      documents,
      ideas,
      idea: { title: idea.title, hook: idea.hook, systems: idea.systemsAffected },
      scenario: {
        title: scenario.title,
        status: scenario.status,
        phases: scenario.phases.length,
        mselRows: scenario.msel.length,
        lastRowTime: scenario.msel.at(-1)?.time,
        warnings: scenario.warnings.length,
      },
      formatEdits: formatEdits.edits,
      injectEdits,
      counts,
      export: {
        folder: result.folder,
        warnings: result.warnings,
        tree,
        mp3: media.filter((m) => m.endsWith('.mp3')),
        mp4: media.filter((m) => m.endsWith('.mp4')),
        posters: media.filter((m) => m.endsWith('-poster.png')),
        pdfPages: await pdfPages(result.folder),
        zip: result.zipPath ? await zipTree(result.zipPath) : [],
      },
    }
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ timings, counts: { ...counts, types: undefined } }, null, 2))

    expect(FIDS.test(`${scenario.title} ${idea.title}`)).toBe(false)
    expect(scenario.phases).toHaveLength(4)
    expect(injectEdits).toHaveLength(5)
    expect(counts.injectsWithMedia).toBeGreaterThanOrEqual(8)
    expect(counts.phoneCallAudio, 'a TTS phone call').toBeGreaterThan(0)
    expect(counts.aiImages, 'an AI scene photo').toBeGreaterThan(0)
    expect(counts.video.length, 'a video clip').toBeGreaterThan(0)
    expect(counts.video.every((v) => v.path.endsWith('.mp4') && v.poster?.endsWith('.png'))).toBe(
      true,
    )
    expect(wavs.length).toBeGreaterThan(0)
    for (const wav of wavs)
      expect(media, `${wav} has no MP3`).toContain(wav.replace(/\.wav$/, '.mp3'))
    expect(report.export.mp4.length).toBeGreaterThan(0)
    expect(report.export.posters.length).toBeGreaterThan(0)
    expect(Object.keys(report.export.pdfPages)).toHaveLength(9)
    expect(report.export.zip.filter((n) => n.startsWith('players/'))).toHaveLength(4)
  } finally {
    await app.close()
  }
})

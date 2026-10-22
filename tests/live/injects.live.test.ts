// The M3 inject quality run (LIVE=1): ingest reference/ncia with the real pipeline, load the
// Scenario 3 MSEL (tests/fixtures/scenarios/scenario-3.json), run generate:injects for every
// row on a local LM Studio model, then generate:media for the brief's seven target injects on
// the real stack (ComfyUI SDXL for photos, mlx-audio for TTS), and save everything under
// tests/fixtures/injects/sample-run/ for comparison with reference/scenario-3/master-inject-deck.md.
//
// Template PNGs need a real Electron main process (this run mocks electron), so the media
// job here renders the ai_image / tts / ai_video paths only; e2e/injects-render.spec.ts then
// opens the project this run leaves in LIVE_PROJECT_DIR and renders the templates.
//
//   LIVE=1 pnpm test -- tests/live/injects.live.test.ts
//   LIVE_RESOURCES=<dir with prompts/ templates/ comfy/>   (defaults to the repo)
//   LIVE_LMSTUDIO_MODEL=qwen3-30b-a3b-2507  LIVE_COMFY_URL=http://127.0.0.1:8188
//   LIVE_TTS_URL=http://127.0.0.1:8765/v1  LIVE_TTS_MODEL=mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16
//   LIVE_ROWS=I-04,I-06   (rows to write; default all)   LIVE_MEDIA=I-04,...   (rows to render)
//   LIVE_SKIP_MEDIA=1  LIVE_OUT=<dir>  LIVE_PROJECT_DIR=<dir>  LIVE_EMBED=hash|provider
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Inject, Scenario, StageRun } from '../../src/shared/schemas'
import { shrinkPngToFit } from '../fixtures/injects/png'
import { shrinkWav } from '../fixtures/injects/wav'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const LIVE = process.env.LIVE === '1'
const LM_URL = process.env.LIVE_LMSTUDIO_URL ?? 'http://127.0.0.1:1234/v1'
const LM_MODEL = process.env.LIVE_LMSTUDIO_MODEL ?? 'qwen3-30b-a3b-2507'
const LM_EMBED = process.env.LIVE_LMSTUDIO_EMBED ?? 'text-embedding-nomic-embed-text-v1.5'
const EMBED_MODE = process.env.LIVE_EMBED ?? 'provider'
const COMFY_URL = process.env.LIVE_COMFY_URL ?? 'http://127.0.0.1:8188'
const TTS_URL = process.env.LIVE_TTS_URL ?? 'http://127.0.0.1:8765/v1'
const TTS_MODEL = process.env.LIVE_TTS_MODEL ?? 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16'
const OUT_DIR = resolve(process.env.LIVE_OUT ?? 'tests/fixtures/injects/sample-run')
const PROJECT_DIR = resolve(process.env.LIVE_PROJECT_DIR ?? '.tmp/live-injects')
const ROWS = process.env.LIVE_ROWS?.split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const MEDIA_ROWS = (process.env.LIVE_MEDIA ?? 'I-04,I-06,I-06b,I-10,I-05b,I-12,I-09')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const SKIP_MEDIA = process.env.LIVE_SKIP_MEDIA === '1'
/** Vitest mocks electron: the offscreen template renderer is left to the e2e spec. */
const MEDIA_PATHS = ['ai_image', 'tts', 'ai_video'] as const
/** Media copied into the fixture folder stays under this many bytes in total. */
const MEDIA_BUDGET = 4 * 1024 * 1024
const MAX_PNG_BYTES = 350 * 1024
const HOUR = 60 * 60 * 1000

process.env.TTX_RESOURCES = resolve(process.env.LIVE_RESOURCES ?? process.cwd())
process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-live-injects-'))

const { createProject } = await import('../../src/main/project/store')
const { updateSettings } = await import('../../src/main/settings/store')
const { importDocuments } = await import('../../src/main/ingest/pipeline')
const { jobs } = await import('../../src/main/jobs/manager')
const { openIndex, closeIndex } = await import('../../src/main/retrieve')
const { createScenario, getScenario, listInjects, saveScenario } =
  await import('../../src/main/scenario/store')
const { dispatch } = await import('../../src/main/ipc/registry')
const { default: generateHandlers } = await import('../../src/main/ipc/handlers/generate')
const { default: injectHandlers } = await import('../../src/main/ipc/handlers/injects')
const { listAdapterKinds } = await import('../../src/main/providers/registry')
const { onEmit } = await import('../../src/main/lib/events')

const handlers = { ...generateHandlers, ...injectHandlers }
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

const files = (dir: string): string[] =>
  readdirSync(resolve(dir))
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(resolve(dir), f))

async function call<T>(name: string, req: unknown): Promise<T> {
  const r = await dispatch(handlers, name, req)
  if (!r.ok) throw new Error(`${name}: ${r.error.code} ${r.error.message}`)
  return r.data as T
}

const seconds = (r: StageRun): number =>
  r.finishedAt ? Math.round((Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 100) / 10 : 0

const text = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (Array.isArray(v))
    return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join('\n')
  return JSON.stringify(v)
}

/** A readable deck in the shape of reference/scenario-3/master-inject-deck.md. */
function deckMarkdown(s: Scenario, injects: Inject[]): string {
  const out: string[] = [
    `# Generated Inject Deck`,
    `## ${s.title}${s.subtitle ? ` — ${s.subtitle}` : ''}`,
    '',
  ]
  for (const row of s.msel) {
    const inject = injects.find((i) => i.mselRowId === row.id)
    out.push(
      `### [INJECT ${row.id}] — ${row.toLabel ?? 'All'} · ${row.time}${row.wallClock ? ` (${row.wallClock})` : ''} · [${row.purposeTag}]`,
    )
    out.push(`MSEL event: ${row.event}`, '')
    if (!inject) {
      out.push('_(no inject written)_', '')
      continue
    }
    out.push(`**${inject.title}** · type: ${inject.type} · delivery: ${inject.deliveryMode}`, '')
    for (const [k, v] of Object.entries(inject.fields))
      out.push(`> **${k}:** ${text(v).replace(/\n/g, '\n> ')}`)
    if (inject.instructorNote) out.push('', `*(Instructor Note: ${inject.instructorNote})*`)
    if (inject.mediaBrief) {
      const b = inject.mediaBrief
      out.push(
        '',
        `Media plan: ${b.paths.join(' + ')}${b.imageStyle ? ` · style ${b.imageStyle}` : ''}`,
      )
      if (b.imagePrompt) out.push(`Image prompt: ${b.imagePrompt}`)
      if (b.voiceLines?.length)
        out.push(...b.voiceLines.map((l) => `Voice (${l.speaker}; ${l.voiceStyle}): ${l.text}`))
    }
    if (inject.assets.length)
      out.push(
        '',
        `Assets: ${inject.assets.map((a) => `${a.kind}/${a.role} ${a.path.split('/').pop()}${a.durationSec ? ` (${a.durationSec}s)` : ''}`).join(', ')}`,
      )
    const warn = s.warnings.filter((w) => w.injectId === inject.id)
    if (warn.length) out.push('', ...warn.map((w) => `⚠ ${w.code}: ${w.message.split('\n')[0]}`))
    out.push('', '---', '')
  }
  return out.join('\n')
}

/** Copy media into the fixture folder (PNGs downscaled) within the byte budget; list the rest. */
function copyMedia(root: string, injects: Inject[]): { copied: string[]; skipped: string[] } {
  const copied: string[] = []
  const skipped: string[] = []
  let used = 0
  for (const inject of injects) {
    for (const a of inject.assets) {
      const src = join(root, a.path)
      const raw = readFileSync(src)
      const bytes =
        a.kind === 'image'
          ? shrinkPngToFit(raw, MAX_PNG_BYTES)
          : a.kind === 'audio'
            ? shrinkWav(raw)
            : raw
      const dest = join(OUT_DIR, 'media', inject.mselRowId, `${a.role}-${a.path.split('/').pop()}`)
      if (used + bytes.length > MEDIA_BUDGET || a.kind === 'video') {
        skipped.push(`${inject.mselRowId} ${a.path} (${Math.round(statSync(src).size / 1024)} KB)`)
        continue
      }
      mkdirSync(join(OUT_DIR, 'media', inject.mselRowId), { recursive: true })
      writeFileSync(dest, bytes)
      used += bytes.length
      copied.push(`${inject.mselRowId} ${a.kind}/${a.role} ${Math.round(bytes.length / 1024)} KB`)
    }
  }
  return { copied, skipped }
}

describe.skipIf(!LIVE)('live inject stages on LM Studio + ComfyUI + mlx-audio', () => {
  let root: string
  let scenarioId: string
  const log: string[] = []
  const t0 = Date.now()
  const say = (m: string): void => {
    const line = `[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`
    log.push(line)
    console.log(line)
  }

  beforeAll(
    async () => {
      const comfy = listAdapterKinds().includes('comfyui')
      say(
        `adapters: ${listAdapterKinds().join(', ')}${comfy ? '' : ' (no comfyui adapter: image steps will fail and be reported)'}`,
      )
      await updateSettings((s) => {
        s.providers = [
          {
            id: 'lmstudio',
            kind: 'openai-compatible',
            label: 'LM Studio',
            baseUrl: LM_URL,
            defaultModel: LM_MODEL,
            options: { embeddingDims: 768 },
            enabled: true,
          },
          {
            id: 'tts',
            kind: 'openai-compatible',
            label: 'mlx-audio',
            baseUrl: TTS_URL,
            defaultModel: TTS_MODEL,
            options: { ttsModel: TTS_MODEL },
            enabled: true,
          },
          ...(comfy
            ? [
                {
                  id: 'comfy',
                  kind: 'comfyui' as const,
                  label: 'ComfyUI',
                  baseUrl: COMFY_URL,
                  options: {},
                  enabled: true,
                },
              ]
            : []),
        ]
        s.defaultRouting = {
          ideate: { providerId: 'lmstudio' },
          draft: { providerId: 'lmstudio' },
          critique: { providerId: 'lmstudio' },
          audio: { providerId: 'tts' },
          ...(comfy ? { image: { providerId: 'comfy' }, video: { providerId: 'comfy' } } : {}),
        }
        s.embeddings =
          EMBED_MODE === 'provider'
            ? { mode: 'provider', providerId: 'lmstudio', model: LM_EMBED }
            : { mode: 'hash', model: 'Xenova/bge-small-en-v1.5' }
      })
      rmSync(PROJECT_DIR, { recursive: true, force: true })
      mkdirSync(PROJECT_DIR, { recursive: true })
      const created = await createProject({
        parentDir: PROJECT_DIR,
        name: 'North Coast International Airport',
        orgName: 'North Coast Regional Airport Authority',
        orgType: 'airport',
      })
      root = created.path
      const sources = [...files('reference/ncia'), ...files('reference/ics-forms')]
      const { jobId } = await importDocuments(root, sources)
      const job = await jobs.wait(jobId)
      expect(job.status, job.error).toBe('done')
      const index = await openIndex(root)
      const hits = await index.search('FIDS failure', { k: 3 })
      say(
        `ingested ${sources.length} docs; "FIDS failure" → ${hits.map((h) => h.headingPath).join(' | ')}`,
      )
      const empty = await createScenario(root, { title: FIXTURE.title, brief: FIXTURE.brief })
      const s = await saveScenario(
        root,
        { ...FIXTURE, id: empty.id, projectId: created.project.id },
        { by: 'user' },
      )
      scenarioId = s.id
      say(`project ${root}; scenario ${scenarioId}`)
      rmSync(join(OUT_DIR, 'media'), { recursive: true, force: true })
      mkdirSync(OUT_DIR, { recursive: true })
    },
    10 * 60 * 1000,
  )

  afterAll(() => {
    if (root) closeIndex(root)
    writeFileSync(join(OUT_DIR, 'run-log.txt'), log.join('\n') + '\n')
  })

  it(
    'writes every inject, renders the target media, and saves the outputs for review',
    async () => {
      const off = onEmit((name, payload) => {
        if (name === 'job:progress') {
          const p = payload as { message: string; stage?: string }
          if (p.stage && !/Sampling step/.test(p.message)) say(`progress: ${p.message}`)
        }
      })
      // ---- text + briefs
      const t1 = Date.now()
      const { jobId } = await call<{ jobId: string }>('generate:injects', {
        projectPath: root,
        scenarioId,
        ...(ROWS ? { rowIds: ROWS } : {}),
      })
      const textJob = await jobs.wait(jobId)
      const textSeconds = Math.round((Date.now() - t1) / 1000)
      say(
        `generate:injects ${textJob.status}${textJob.error ? `: ${textJob.error}` : ''} in ${textSeconds}s; ${JSON.stringify(textJob.result)}`,
      )
      let s = await getScenario(root, scenarioId)
      let injects = await listInjects(root, scenarioId)
      const rowOf = (r: StageRun) => injects.find((i) => i.id === r.itemId)
      const textRuns = s.provenance.filter((r) => r.stage === 'inject_text')
      for (const r of textRuns)
        say(
          `  ${rowOf(r)?.mselRowId ?? r.itemId} ${rowOf(r)?.type ?? ''}: ${r.status} ${seconds(r)}s in=${r.inputTokens ?? 0} out=${r.outputTokens ?? 0} repairs=${r.repairAttempts}`,
        )
      const briefRuns = s.provenance.filter(
        (r) => r.stage === 'inject_media_brief' && r.status === 'ok',
      )
      say(
        `media briefs: ${briefRuns.length} model calls, ${briefRuns.reduce((n, r) => n + seconds(r), 0).toFixed(0)}s`,
      )

      // ---- media for the target injects (AI image, TTS, video; templates via the e2e spec)
      let mediaJob: { status: string; error?: string; result?: unknown } | undefined
      let mediaSeconds = 0
      const targets = injects.filter((i) => MEDIA_ROWS.includes(i.mselRowId)).map((i) => i.id)
      if (!SKIP_MEDIA && targets.length) {
        const t2 = Date.now()
        const m = await call<{ jobId: string }>('generate:media', {
          projectPath: root,
          scenarioId,
          injectIds: targets,
          paths: [...MEDIA_PATHS],
        })
        mediaJob = await jobs.wait(m.jobId)
        mediaSeconds = Math.round((Date.now() - t2) / 1000)
        say(
          `generate:media ${mediaJob.status}${mediaJob.error ? `: ${mediaJob.error}` : ''} in ${mediaSeconds}s; ${JSON.stringify(mediaJob.result)}`,
        )
        s = await getScenario(root, scenarioId)
        injects = await listInjects(root, scenarioId)
        for (const r of s.provenance.filter((x) => x.stage === 'media_render'))
          say(
            `  ${rowOf(r)?.mselRowId ?? r.itemId} ${r.promptRef}: ${r.status} ${seconds(r)}s${r.error ? ` — ${r.error}` : ''}`,
          )
        for (const e of jobs.logOf(m.jobId).entries.filter((x) => x.level !== 'info'))
          say(`  log ${e.level}: ${e.message.split('\n')[0]}`)
      }
      off()

      // ---- save everything for review before asserting
      writeFileSync(join(OUT_DIR, 'injects.json'), JSON.stringify(injects, null, 2))
      writeFileSync(join(OUT_DIR, 'scenario.json'), JSON.stringify(s, null, 2))
      writeFileSync(join(OUT_DIR, 'inject-deck.md'), deckMarkdown(s, injects))
      const media = copyMedia(root, injects)
      const warnings = s.warnings.filter((w) => w.injectId)
      writeFileSync(
        join(OUT_DIR, 'run-report.json'),
        JSON.stringify(
          {
            model: LM_MODEL,
            ttsModel: TTS_MODEL,
            comfy: listAdapterKinds().includes('comfyui'),
            projectPath: root,
            scenarioId,
            text: {
              job: textJob.status,
              seconds: textSeconds,
              result: textJob.result,
              rows: textRuns.map((r) => ({
                row: rowOf(r)?.mselRowId ?? r.itemId,
                type: rowOf(r)?.type,
                status: r.status,
                seconds: seconds(r),
                inputTokens: r.inputTokens,
                outputTokens: r.outputTokens,
                repairs: r.repairAttempts,
              })),
            },
            briefs: briefRuns.length,
            media: mediaJob
              ? {
                  job: mediaJob.status,
                  seconds: mediaSeconds,
                  paths: MEDIA_PATHS,
                  result: mediaJob.result,
                }
              : 'skipped',
            warnings: warnings.map((w) => ({
              code: w.code,
              rowId: w.rowId,
              message: w.message.split('\n')[0],
            })),
            mediaFiles: media,
          },
          null,
          2,
        ),
      )
      say(`warnings: ${warnings.map((w) => `${w.code}(${w.rowId})`).join(', ') || 'none'}`)
      say(`media copied: ${media.copied.length}; skipped: ${media.skipped.length}`)

      // ---- exit criteria
      expect(textJob.status, textJob.error).toBe('done')
      const expected = ROWS ?? s.msel.map((r) => r.id)
      expect(injects.map((i) => i.mselRowId).sort()).toEqual([...expected].sort())
      const invalid = warnings.filter((w) => w.code === 'INJECT_FIELDS_INVALID')
      expect(invalid.length, JSON.stringify(invalid)).toBeLessThanOrEqual(
        Math.ceil(expected.length * 0.15),
      )
      if (mediaJob) {
        expect(mediaJob.status, mediaJob.error).toBe('done')
        for (const id of targets) {
          const inj = injects.find((i) => i.id === id)!
          const planned =
            inj.mediaBrief?.paths.filter((p) => (MEDIA_PATHS as readonly string[]).includes(p)) ??
            []
          if (planned.length)
            expect(
              inj.assets.length,
              `${inj.mselRowId} rendered ${planned.join('+')}`,
            ).toBeGreaterThan(0)
        }
      }
    },
    2 * HOUR,
  )
})

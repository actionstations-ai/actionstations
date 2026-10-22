// M3 exit / acceptance (#36): regenerate Scenario 3's Master Inject Deck from its MSEL in the
// built app with the real local stack — LM Studio (text), ComfyUI SDXL (photos), mlx-audio
// (TTS) — and check every MSEL row gets a rendered deck page. Opt-in, takes several minutes:
//   LIVE=1 pnpm exec playwright test e2e/m3-exit.spec.ts
// Outputs (copied media + summary) go to .tmp/m3-exit/ (Playwright wipes test-results/).
import { expect, test } from '@playwright/test'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { invoker, launch } from './helpers'

test.skip(!process.env.LIVE, 'Live media acceptance runs only with LIVE=1')
test.setTimeout(45 * 60_000)

const OUT = resolve('.tmp/m3-exit')
const SCENARIO_3 = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>
const mdFiles = (dir: string) =>
  readdirSync(resolve(dir))
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(resolve(dir), f))

interface Job {
  status: string
  error?: string
  message: string
}
interface Asset {
  id: string
  kind: string
  role: string
  path: string
  durationSec?: number
}
interface Inject {
  id: string
  mselRowId: string
  type: string
  title: string
  assets: Asset[]
}

test('M3 exit: Scenario 3 deck regenerated with templates, SDXL photos and TTS', async () => {
  mkdirSync(join(OUT, 'media'), { recursive: true })
  const { app, page } = await launch()
  const invoke = invoker(page)
  const waitJob = async (jobId: string, label: string) => {
    const t0 = Date.now()
    await expect
      .poll(async () => (await invoke<Job>('jobs:get', { jobId })).status, {
        timeout: 40 * 60_000,
        intervals: [5000],
      })
      .toMatch(/done|error|cancelled/)
    const job = await invoke<Job>('jobs:get', { jobId })
    const secs = Math.round((Date.now() - t0) / 1000)
    console.log(`${label}: ${job.status} in ${secs} s — ${job.message} ${job.error ?? ''}`)
    expect(job.status, job.error).toBe('done')
    return secs
  }
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-m3-'))
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
          aliases: {
            org: 'North Coast International Airport',
            orgShort: 'NCIA',
            orgDomain: 'ncia-airport.org',
            localTv: 'Channel 5',
          },
        },
      },
    })
    await invoke('documents:import', {
      projectPath,
      filePaths: [...mdFiles('reference/ncia'), ...mdFiles('reference/ics-forms')],
    })
    await expect
      .poll(
        async () =>
          (await invoke<{ status: string }[]>('documents:list', { projectPath })).every(
            (d) => d.status === 'ok',
          ),
        {
          timeout: 60_000,
        },
      )
      .toBe(true)

    const lm = await invoke<{ id: string }>('providers:upsert', {
      config: {
        kind: 'openai-compatible',
        label: 'LM Studio',
        baseUrl: 'http://127.0.0.1:1234/v1',
        defaultModel: 'qwen3-30b-a3b-2507',
        options: {},
        enabled: true,
      },
    })
    const comfy = await invoke<{ id: string }>('providers:upsert', {
      config: {
        kind: 'comfyui',
        label: 'ComfyUI',
        baseUrl: 'http://127.0.0.1:8188',
        options: {},
        enabled: true,
      },
    })
    const tts = await invoke<{ id: string }>('providers:upsert', {
      config: {
        kind: 'openai-compatible',
        label: 'Local TTS (mlx-audio)',
        baseUrl: 'http://127.0.0.1:8765',
        defaultModel: 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16',
        options: { ttsModel: 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16' },
        enabled: true,
      },
    })
    for (const id of [lm.id, comfy.id, tts.id]) {
      const h = await invoke<{ ok: boolean; message?: string }>('providers:health', { id })
      expect(h.ok, `${id}: ${h.message}`).toBe(true)
    }
    await invoke('routing:set', {
      scope: 'global',
      routing: {
        ideate: { providerId: lm.id },
        draft: { providerId: lm.id },
        critique: { providerId: lm.id },
        image: { providerId: comfy.id },
        video: { providerId: comfy.id },
        audio: { providerId: tts.id },
      },
    })

    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...SCENARIO_3, id: empty.id, projectId: empty.projectId, documents: {} },
      note: 'Scenario 3 MSEL (reference)',
    })
    const scenarioId = empty.id

    const textSecs = await waitJob(
      (await invoke<{ jobId: string }>('generate:injects', { projectPath, scenarioId })).jobId,
      'inject text',
    )
    const mediaSecs = await waitJob(
      (await invoke<{ jobId: string }>('generate:media', { projectPath, scenarioId })).jobId,
      'inject media',
    )

    const injects = await invoke<Inject[]>('injects:list', { projectPath, scenarioId })
    const rows = (SCENARIO_3.msel as { id: string }[]).map((r) => r.id)
    const byRow = new Map(injects.map((i) => [i.mselRowId, i]))
    const missing = rows.filter(
      (id) => !byRow.get(id)?.assets.some((a) => a.kind === 'image' && a.role !== 'generated'),
    )
    const kinds = (k: string) => injects.flatMap((i) => i.assets.filter((a) => a.kind === k))
    const summary = {
      rows: rows.length,
      injects: injects.length,
      renderedPages: rows.length - missing.length,
      missingPages: missing,
      aiImages: kinds('image').filter((a) => a.role === 'generated').length,
      composites: kinds('image').filter((a) => a.role === 'composite').length,
      pdfs: kinds('pdf').length,
      audio: kinds('audio').map((a) => `${a.path} (${a.durationSec?.toFixed(1)} s)`),
      video: kinds('video').length,
      textSecs,
      mediaSecs,
      types: injects.map((i) => `${i.mselRowId}: ${i.type}`),
    }
    console.log(JSON.stringify(summary, null, 2))
    writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
    writeFileSync(join(OUT, 'injects.json'), JSON.stringify(injects, null, 2))
    for (const inj of injects) {
      for (const a of inj.assets) {
        const name = `${inj.mselRowId}-${inj.type}-${a.role}${a.kind === 'pdf' ? '' : ''}-${basename(a.path)}`
        copyFileSync(join(projectPath, a.path), join(OUT, 'media', name))
      }
    }

    expect(missing, `rows without a rendered deck page: ${missing.join(', ')}`).toEqual([])
    expect(summary.aiImages, 'at least one AI scene photo').toBeGreaterThan(0)
    expect(summary.audio.length, 'at least one TTS clip').toBeGreaterThan(0)
  } finally {
    await app.close()
  }
})

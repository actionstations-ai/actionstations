// The M2 quality exit test (LIVE=1): build a project from reference/ncia + ICS forms with the
// real ingest and index, route text tasks to a local LM Studio model through the real
// OpenAI-compatible adapter, run ideas → pick a non-FIDS idea → full pipeline, then check the
// MSEL against the lints and save the outputs under tests/fixtures/generate/sample-run/.
//
//   LIVE=1 pnpm test -- tests/live/pipeline.live.test.ts
//   LIVE_LMSTUDIO_MODEL=openai/gpt-oss-20b  LIVE_EMBED=hash  LIVE_IDEA=<title substring>  LIVE_OUT=<dir>
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Scenario, ScenarioIdea, StageRun } from '../../src/shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const LIVE = process.env.LIVE === '1'
const LM_URL = process.env.LIVE_LMSTUDIO_URL ?? 'http://127.0.0.1:1234/v1'
const LM_MODEL = process.env.LIVE_LMSTUDIO_MODEL ?? 'qwen3-30b-a3b-2507'
const LM_EMBED = process.env.LIVE_LMSTUDIO_EMBED ?? 'text-embedding-nomic-embed-text-v1.5'
const EMBED_MODE = process.env.LIVE_EMBED ?? 'provider'
const OUT_DIR = resolve(process.env.LIVE_OUT ?? 'tests/fixtures/generate/sample-run')
const HOUR = 60 * 60 * 1000

process.env.TTX_RESOURCES = resolve(process.cwd())
process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-live-pipeline-'))

const { createProject } = await import('../../src/main/project/store')
const { updateSettings } = await import('../../src/main/settings/store')
const { importDocuments } = await import('../../src/main/ingest/pipeline')
const { jobs } = await import('../../src/main/jobs/manager')
const { openIndex, closeIndex } = await import('../../src/main/retrieve')
const { getScenario, readScenarioDoc } = await import('../../src/main/scenario/store')
const { dispatch } = await import('../../src/main/ipc/registry')
const { default: generateHandlers } = await import('../../src/main/ipc/handlers/generate')
const { lintScenario } = await import('../../src/main/generate/lint')
const { onEmit } = await import('../../src/main/lib/events')

const files = (dir: string): string[] =>
  readdirSync(resolve(dir))
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(resolve(dir), f))

async function call<T>(name: string, req: unknown): Promise<T> {
  const r = await dispatch(generateHandlers, name, req)
  if (!r.ok) throw new Error(`${name}: ${r.error.code} ${r.error.message}`)
  return r.data as T
}

const duration = (r: StageRun): number =>
  r.finishedAt ? (Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000 : 0

function runReport(s: Scenario) {
  const rows = s.provenance.map((r) => ({
    stage: r.stage + (r.itemId ? ` ${s.phases.find((p) => p.id === r.itemId)?.index ?? ''}` : ''),
    status: r.status,
    seconds: Math.round(duration(r)),
    inputTokens: r.inputTokens ?? 0,
    outputTokens: r.outputTokens ?? 0,
    repairs: r.repairAttempts,
    model: r.model,
  }))
  const total = {
    seconds: rows.reduce((n, r) => n + r.seconds, 0),
    inputTokens: rows.reduce((n, r) => n + r.inputTokens, 0),
    outputTokens: rows.reduce((n, r) => n + r.outputTokens, 0),
  }
  return { rows, total }
}

describe.skipIf(!LIVE)('live NCIA pipeline on LM Studio', () => {
  let root: string
  const log: string[] = []
  const t0 = Date.now()
  const say = (m: string): void => {
    const line = `[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`
    log.push(line)
    console.log(line)
  }

  beforeAll(
    async () => {
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
        ]
        s.defaultRouting = {
          ideate: { providerId: 'lmstudio' },
          draft: { providerId: 'lmstudio' },
          critique: { providerId: 'lmstudio' },
        }
        s.embeddings =
          EMBED_MODE === 'provider'
            ? { mode: 'provider', providerId: 'lmstudio', model: LM_EMBED }
            : { mode: 'hash', model: 'Xenova/bge-small-en-v1.5' }
      })
      const parentDir = mkdtempSync(join(tmpdir(), 'ttx-live-proj-'))
      root = (
        await createProject({
          parentDir,
          name: 'North Coast International Airport',
          orgName: 'North Coast Regional Airport Authority',
          orgType: 'airport',
        })
      ).path
      const sources = [...files('reference/ncia'), ...files('reference/ics-forms')]
      const { jobId } = await importDocuments(root, sources)
      const job = await jobs.wait(jobId)
      expect(job.status, job.error).toBe('done')
      const index = await openIndex(root)
      const hits = await index.search('FIDS failure', { k: 5 })
      say(
        `ingested ${sources.length} docs; "FIDS failure" → ${hits.map((h) => h.headingPath).join(' | ')}`,
      )
      expect(hits.map((h) => h.headingPath).join('\n')).toMatch(/13\.6/)
      mkdirSync(OUT_DIR, { recursive: true })
    },
    10 * 60 * 1000,
  )

  afterAll(() => {
    if (root) closeIndex(root)
    writeFileSync(join(OUT_DIR, 'run-log.txt'), log.join('\n') + '\n')
  })

  it(
    'ideas → non-FIDS scenario → full package that passes the lints',
    async () => {
      const off = onEmit((name, payload) => {
        if (name === 'job:progress') {
          const p = payload as { message: string; stage?: string }
          if (p.stage) say(`progress: ${p.message}`)
        }
      })
      // ---- ideas
      const { jobId: ideasJob } = await call<{ jobId: string }>('generate:ideas', {
        projectPath: root,
        brief: { audience: ['Airport Operations', 'IT/Cybersecurity', 'PIO', 'Security/LEO'] },
        count: 8,
      })
      const ideasDone = await jobs.wait(ideasJob)
      expect(ideasDone.status, ideasDone.error).toBe('done')
      const ideas = await call<ScenarioIdea[]>('generate:ideas-result', { projectPath: root })
      say(`${ideas.length} ideas: ${ideas.map((i) => i.title).join(' / ')}`)
      writeFileSync(join(OUT_DIR, 'ideas.json'), JSON.stringify(ideas, null, 2))
      expect(ideas.length).toBeGreaterThanOrEqual(5)
      expect(ideas.length).toBeLessThanOrEqual(10)
      const grounded = ideas.filter((i) => i.sectionsExercised.length > 0)
      expect(grounded.length).toBeGreaterThanOrEqual(Math.ceil(ideas.length * 0.8))
      const wanted = process.env.LIVE_IDEA?.toLowerCase()
      const byTitle = wanted ? ideas.find((i) => i.title.toLowerCase().includes(wanted)) : undefined
      const idea =
        byTitle ??
        ideas.find(
          (i) => !/fids|flight information|aodb/i.test(`${i.title} ${i.systemsAffected.join(' ')}`),
        )
      expect(idea, 'a non-FIDS idea').toBeDefined()
      say(`picked "${idea!.title}" — ${idea!.hook}`)

      // ---- scenario
      const { jobId, scenarioId } = await call<{ jobId: string; scenarioId: string }>(
        'generate:scenario',
        {
          projectPath: root,
          brief: {
            userPrompt: '',
            audience: ['Airport Operations', 'IT/Cybersecurity', 'PIO', 'Security/LEO'],
            durationHours: 4,
            phaseCount: 4,
            learningObjectives: [],
            constraints: [],
            startWallClock: '09:00',
          },
          idea: idea!,
        },
      )
      const job = await jobs.wait(jobId)
      off()
      const s = await getScenario(root, scenarioId)
      const report = runReport(s)
      say(`job ${job.status}${job.error ? `: ${job.error}` : ''}; ${JSON.stringify(report.total)}`)
      for (const r of report.rows)
        say(
          `  ${r.stage}: ${r.status} ${r.seconds}s in=${r.inputTokens} out=${r.outputTokens} repairs=${r.repairs}`,
        )

      // ---- save everything for review before asserting
      const index = await openIndex(root)
      const lints = lintScenario(s)
      const citations = s.msel.flatMap((r) => r.citations)
      const resolved = citations.filter((c) => c.chunkId !== undefined && index.chunk(c.chunkId!))
      writeFileSync(join(OUT_DIR, 'scenario.json'), JSON.stringify(s, null, 2))
      writeFileSync(
        join(OUT_DIR, 'lint.json'),
        JSON.stringify({ lints, warnings: s.warnings }, null, 2),
      )
      writeFileSync(
        join(OUT_DIR, 'run-report.json'),
        JSON.stringify(
          {
            model: LM_MODEL,
            embed: EMBED_MODE,
            job: job.status,
            ...report,
            rowCount: s.msel.length,
            citations: citations.length,
            resolvedCitations: resolved.length,
            lintCodes: lints.map((l) => l.code),
          },
          null,
          2,
        ),
      )
      for (const [kind, file] of [
        ['overview', 'msel.md'],
        ['handbook', 'handbook.md'],
        ['briefing', 'briefing.md'],
        ['hotwash', 'hotwash.md'],
      ] as const) {
        const md = await readScenarioDoc(root, scenarioId, kind)
        if (md) writeFileSync(join(OUT_DIR, file), md)
      }
      say(
        `lints: ${lints.map((l) => `${l.code}${l.rowId ? `(${l.rowId})` : ''}`).join(', ') || 'none'}`,
      )
      say(`citations: ${resolved.length}/${citations.length} resolve to chunks`)

      // ---- the exit criteria
      expect(job.status, job.error).toBe('done')
      expect(s.msel.length).toBeGreaterThanOrEqual(20)
      expect(s.documents.handbook && s.documents.briefing).toBeTruthy()
      expect(resolved.length).toBe(citations.length)
      expect(citations.length).toBeGreaterThanOrEqual(6)
      const blocking = lints.filter((l) => l.severity === 'error')
      expect(blocking, JSON.stringify(blocking)).toEqual([])
      const mix = lints.filter(
        (l) =>
          l.code.startsWith('MIX_') ||
          l.code === 'NO_DECISION_POINT' ||
          l.code.startsWith('STARTEX') ||
          l.code.startsWith('ENDEX'),
      )
      expect(mix.length, JSON.stringify(mix)).toBeLessThanOrEqual(2)
    },
    HOUR,
  )
})

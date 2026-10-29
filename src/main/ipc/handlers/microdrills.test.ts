// Integration (#437): micro-drills through the IPC dispatcher on a real project folder with the
// mock provider. Build from an annex, fix and mark Ready, run with a model-checked answer, take
// hints, finish, read the debrief, and check that the program snapshot gets totals only.
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Chunk, MicroDrill, MicroDrillRun } from '@shared/schemas'

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    getVersion: () => '0.0.1',
    getPath: () => tmpdir(),
    getAppPath: () => process.cwd(),
    isPackaged: false,
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_MOCK_PROVIDERS = '1'
process.env.TTX_RESOURCES = resolve(process.cwd())

const { dispatch } = await import('../registry')
const handlers = (await import('./microdrills')).default
const { jobs } = await import('../../jobs/manager')
const { createProject } = await import('../../project/store')
const { documentFiles, saveMeta, sha256File, writeText } = await import('../../ingest/storage')
const { writeFileAtomic } = await import('../../lib/fs')
const { resetSettingsCache } = await import('../../settings/store')
const { resetResolveState } = await import('../../providers/resolve')
const { setPipelineDeps } = await import('../../generate/deps')
const { clearProbeCache } = await import('../../microdrill/assess')
const { snapshotProject } = await import('../../program/snapshot')
const { setMockResponse, clearMockResponses } = await import('../../providers/mock/adapter')
const { DocumentMeta } = await import('@shared/schemas')

const SENTENCE = 'The PIO may release information after consulting the Incident Commander.'
const HEADING = 'EOP › 6.4 Public Information'

class PlanIndex {
  private readonly list: (Chunk & { documentTitle: string })[] = [
    {
      id: 1,
      documentId: 'eop',
      documentTitle: 'Emergency Operations Plan',
      headingPath: HEADING,
      ord: 0,
      text: `${SENTENCE}\n\nRumors are logged by the PIO.`,
      tokenCount: 30,
      page: 12,
    },
  ]
  async search() {
    return []
  }
  chunk(id: number) {
    return this.list.find((c) => c.id === id)
  }
  chunks(documentId: string) {
    return this.list.filter((c) => c.documentId === documentId)
  }
}

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  clearProbeCache()
  setPipelineDeps({ openIndex: async () => new PlanIndex() })
  const { path: root } = await createProject({
    parentDir: mkdtempSync(join(tmpdir(), 'ttx-micro-')),
    name: 'NCIA',
    orgType: 'airport',
  })
  const files = documentFiles(root, { id: 'eop', filename: 'eop.md' })
  await writeFileAtomic(files.original, `## 6.4 Public Information\n\n${SENTENCE}\n`)
  const meta = DocumentMeta.parse({
    id: 'eop',
    title: 'Emergency Operations Plan',
    filename: 'eop.md',
    status: 'ok',
    ingestedAt: '2026-03-02T10:00:00.000Z',
    sha256: await sha256File(files.original),
  })
  await saveMeta(root, meta)
  await writeText(root, meta, `${HEADING}\n\n${SENTENCE}\n`)
  const ok = async <T>(channel: string, req: Record<string, unknown> = {}) => {
    const r = (await dispatch(handlers, channel as never, {
      projectPath: root,
      ...req,
    })) as Result<T>
    if (!r.ok) throw new Error(`${channel}: ${r.error.code} ${r.error.message}`)
    return r.data
  }
  const fail = async (channel: string, req: Record<string, unknown> = {}) =>
    (await dispatch(handlers, channel as never, { projectPath: root, ...req })) as Result<unknown>
  return { root, ok, fail }
}

afterEach(() => {
  setPipelineDeps(undefined)
  clearMockResponses()
})

type Env = Awaited<ReturnType<typeof setup>>
const SETTINGS = { audience: 'new_staff', durationMin: 15, mode: 'solo', stepCount: 3, focus: '' }

async function buildDrill(env: Env): Promise<MicroDrill> {
  const { jobId } = await env.ok<{ jobId: string }>('microdrills:build', {
    documentId: 'eop',
    headingPath: HEADING,
    settings: SETTINGS,
  })
  const job = await jobs.wait(jobId)
  expect(job.status, job.error).toBe('done')
  const [item] = await env.ok<{ id: string }[]>('microdrills:list')
  return env.ok<MicroDrill>('microdrills:get', { id: item!.id })
}

async function readyDrill(env: Env): Promise<MicroDrill> {
  const drill = await buildDrill(env)
  return env.ok<MicroDrill>('microdrills:save', { drill: { ...drill, status: 'ready' } })
}

describe('building', () => {
  it('lists the headings of the document with sizes', async () => {
    const env = await setup()
    const annexes = await env.ok<{ headingPath: string; tokens: number; tooLarge: boolean }[]>(
      'microdrills:annexes',
      { documentId: 'eop' },
    )
    expect(annexes).toContainEqual({ headingPath: HEADING, tokens: 30, page: 12, tooLarge: false })
  })

  it('builds a draft with prewritten hints and no open problems from the annex', async () => {
    const env = await setup()
    const drill = await buildDrill(env)
    expect(drill.status).toBe('draft')
    expect(drill.lint).toEqual([])
    expect(drill.annex).toMatchObject({ documentId: 'eop', headingPath: HEADING, page: 12 })
    expect(drill.steps.every((s) => s.hints.length === 3)).toBe(true)
    expect(drill.objectives[0]!.capability).toBe('public_information_and_warning')
  })

  it('keeps a drill with a quote that is not in the plan from Ready until it is overridden', async () => {
    const env = await setup()
    const drill = await buildDrill(env)
    const bad = structuredClone(drill)
    bad.steps[0]!.hints[2] = { ...bad.steps[0]!.hints[2], quote: 'A sentence the plan lacks.' }
    const refused = await env.fail('microdrills:save', { drill: { ...bad, status: 'ready' } })
    expect(refused.ok).toBe(false)
    const saved = await env.ok<MicroDrill>('microdrills:save', { drill: bad })
    expect(saved.lint.map((i) => i.code)).toContain('quote_not_verbatim')
    const forced = await env.ok<MicroDrill>('microdrills:save', {
      drill: { ...saved, status: 'ready', lintOverridden: true },
    })
    expect(forced).toMatchObject({ status: 'ready', lintOverridden: true })
  })

  it('refuses to run a draft', async () => {
    const env = await setup()
    const drill = await buildDrill(env)
    const r = await env.fail('microdrills:run-start', { drillId: drill.id })
    expect(r.ok).toBe(false)
  })
})

const GOOD = 'The PIO may release information, after consulting the Incident Commander.'

describe('running', () => {
  it('checks answers with the model, offers hints, scores them and finishes', async () => {
    const env = await setup()
    const drill = await readyDrill(env)
    let run = await env.ok<MicroDrillRun>('microdrills:run-start', { drillId: drill.id })
    expect(run).toMatchObject({ assessment: 'model', hintRule: 'first_miss' })
    const [s1, s2] = drill.steps

    const wrong = await env.ok<{ run: MicroDrillRun; hintOffer: number | null }>(
      'microdrills:answer',
      {
        runId: run.id,
        stepId: s1!.id,
        participantLabel: 'Participant 1',
        text: 'I would ring my manager.',
      },
    )
    expect(wrong.hintOffer).toBe(1)
    const h1 = await env.ok<{ hint: { level: number; text: string } }>('microdrills:hint', {
      runId: run.id,
      stepId: s1!.id,
    })
    expect(h1.hint).toMatchObject({ level: 1, text: s1!.hints[0].text })
    const h2 = await env.ok<{ hint: { level: number; headingPath: string; page: number } }>(
      'microdrills:hint',
      { runId: run.id, stepId: s1!.id },
    )
    expect(h2.hint).toMatchObject({ level: 2, headingPath: HEADING, page: 12 })

    const right = await env.ok<{ run: MicroDrillRun; hintOffer: number | null }>(
      'microdrills:answer',
      { runId: run.id, stepId: s1!.id, participantLabel: 'Participant 1', text: GOOD },
    )
    expect(right.hintOffer).toBeNull()
    expect(right.run.steps[0]!.score).toBe(0.75)

    await env.ok('microdrills:answer', {
      runId: run.id,
      stepId: s2!.id,
      participantLabel: 'Participant 1',
      text: 'Agents refer questions to the PIO and do not guess at causes.',
    })
    run = await env.ok<MicroDrillRun>('microdrills:run-finish', { runId: run.id, pausedSec: 30 })
    expect(run.finishedAt).toBeTruthy()
    expect(run.coverage).toBeCloseTo((0.75 + 1 + 0) / 3, 2)

    const debrief = await env.ok<{
      notice: string
      reviewLine: string
      steps: { points: { status: string }[]; modelAnswer: string }[]
    }>('microdrills:debrief', { runId: run.id })
    expect(debrief.notice).toMatch(/practice/)
    expect(debrief.steps[2]!.points[0]!.status).toBe('missed')
    expect(debrief.reviewLine).toContain(HEADING)
    expect(debrief.steps[0]!.modelAnswer).toBeTruthy()
  })

  it('never writes hints at run time: only the three prewritten hints are served', async () => {
    const env = await setup()
    const drill = await readyDrill(env)
    const run = await env.ok<MicroDrillRun>('microdrills:run-start', { drillId: drill.id })
    const step = drill.steps[0]!
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      const r = await env.ok<{ hint: { text: string } }>('microdrills:hint', {
        runId: run.id,
        stepId: step.id,
      })
      seen.push(r.hint.text)
    }
    expect(seen).toEqual(step.hints.map((h) => h.text))
    expect((await env.fail('microdrills:hint', { runId: run.id, stepId: step.id })).ok).toBe(false)
  })

  it('falls back to a checklist when the model misjudges a probe, and says why', async () => {
    const env = await setup()
    setMockResponse('MicroDrillAssessOutput', () => ({
      covered: ['p1', 'p2', 'p3'],
      partial: [],
      missing: [],
    }))
    const drill = await readyDrill(env)
    const run = await env.ok<MicroDrillRun>('microdrills:run-start', { drillId: drill.id })
    expect(run.assessment).toBe('checklist')
    expect(run.checklistReason).toMatch(/misjudged/)
    const step = drill.steps[0]!
    const done = await env.ok<{ run: MicroDrillRun }>('microdrills:answer', {
      runId: run.id,
      stepId: step.id,
      participantLabel: 'Participant 1',
      text: 'my own notes',
      ticked: [step.expectedPoints[0]!.id],
    })
    expect(done.run.steps[0]!.attempts[0]).toMatchObject({
      covered: [step.expectedPoints[0]!.id],
      missing: [step.expectedPoints[1]!.id],
    })
  })

  it('fades hints on a repeat run for the same participant label', async () => {
    const env = await setup()
    const drill = await readyDrill(env)
    const answers = [
      'The PIO may release information, after consulting the Incident Commander.',
      'Agents refer questions to the PIO and do not guess at causes.',
      'Release waits for consultation with the Incident Commander.',
    ]
    const play = async () => {
      const run = await env.ok<MicroDrillRun>('microdrills:run-start', { drillId: drill.id })
      for (const [i, s] of drill.steps.entries())
        await env.ok('microdrills:answer', {
          runId: run.id,
          stepId: s.id,
          participantLabel: 'Participant 1',
          text: answers[i]!,
        })
      await env.ok('microdrills:run-finish', { runId: run.id, pausedSec: 0 })
      return run
    }
    expect((await play()).hintRule).toBe('first_miss')
    const second = await env.ok<MicroDrillRun>('microdrills:run-start', { drillId: drill.id })
    expect(second.hintRule).toBe('second_miss')
    expect(second.withdrawnLevel3).toEqual([])
    await env.ok('microdrills:run-finish', { runId: second.id, pausedSec: 0 })
    await play()
    const fourth = await env.ok<MicroDrillRun>('microdrills:run-start', { drillId: drill.id })
    expect(fourth.withdrawnLevel3.length).toBeGreaterThan(0)
  })

  it('needs two to six labelled people for a team drill', async () => {
    const env = await setup()
    const drill = await buildDrill(env)
    const team = { ...drill, mode: 'team' as const, status: 'ready' as const }
    await env.ok('microdrills:save', { drill: team })
    const one = await env.fail('microdrills:run-start', { drillId: drill.id })
    expect(one.ok).toBe(false)
    const run = await env.ok<MicroDrillRun>('microdrills:run-start', {
      drillId: drill.id,
      participants: [{ label: 'Desk', name: 'Sam' }, { label: 'Ops' }],
    })
    expect(run.participants).toEqual([{ label: 'Desk', name: 'Sam' }, { label: 'Ops' }])
  })
})

describe('results', () => {
  it('writes totals only to the snapshot: no answers, no names', async () => {
    const env = await setup()
    const drill = await readyDrill(env)
    const run = await env.ok<MicroDrillRun>('microdrills:run-start', {
      drillId: drill.id,
      participants: [{ label: 'Participant 1', name: 'Jordan Rivera' }],
    })
    await env.ok('microdrills:answer', {
      runId: run.id,
      stepId: drill.steps[0]!.id,
      participantLabel: 'Participant 1',
      text: `${GOOD} Secret answer text.`,
    })
    await env.ok('microdrills:run-finish', { runId: run.id, pausedSec: 0 })
    const snap = await snapshotProject(env.root)
    expect(snap.drills).toHaveLength(1)
    expect(snap.drills![0]).toMatchObject({
      drillId: drill.id,
      planSection: { documentId: 'eop', headingPath: HEADING, page: 12 },
      coreCapabilities: ['public_information_and_warning'],
      participants: 1,
    })
    const json = JSON.stringify(snap)
    expect(json).not.toContain('Secret answer')
    expect(json).not.toContain('Jordan')
  })

  it('removes participant names from the runs and keeps the results', async () => {
    const env = await setup()
    const drill = await readyDrill(env)
    await env.ok('microdrills:run-start', {
      drillId: drill.id,
      participants: [{ label: 'Participant 1', name: 'Jordan Rivera' }],
    })
    expect(await env.ok('microdrills:remove-names', { id: drill.id })).toEqual({ removed: 1 })
    const [run] = await env.ok<MicroDrillRun[]>('microdrills:runs', { drillId: drill.id })
    expect(run!.participants).toEqual([{ label: 'Participant 1' }])
  })

  it('writes the debrief PDF into the project exports folder', async () => {
    const env = await setup()
    const drill = await readyDrill(env)
    const run = await env.ok<MicroDrillRun>('microdrills:run-start', { drillId: drill.id })
    await env.ok('microdrills:run-finish', { runId: run.id, pausedSec: 0 })
    vi.doMock('../../export/pdf', () => ({ htmlToPdf: async () => Buffer.from('%PDF-1.4') }))
    const { path } = await env.ok<{ path: string }>('microdrills:debrief-pdf', { runId: run.id })
    expect(path.startsWith(join(env.root, 'exports'))).toBe(true)
    expect(existsSync(path)).toBe(true)
    expect(readdirSync(join(env.root, 'exports'))).toContain(`drill-debrief-${run.id}.pdf`)
    expect(readFileSync(path).subarray(0, 4).toString()).toBe('%PDF')
  })
})

// Re-running MSEL steps marks the injects of changed or removed rows stale (#207), and a step
// that fails or is cancelled after it rendered a document leaves the documents as they were
// (#209). Runs the real pipeline over the mock provider, like engine.review.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import type { MselPhaseOutput, Scenario, StageRun } from '@shared/schemas'
import type { ChatRequest } from '../providers/types'
import { FakeNciaIndex } from '../../../tests/fixtures/generate/fakes'
import { RUBRIC, mselResponder } from '../../../tests/fixtures/generate/stage-fixtures'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

process.env.TTX_MOCK_PROVIDERS = '1'
process.env.TTX_RESOURCES = resolve(process.cwd())

const { dispatch } = await import('../ipc/registry')
const { default: projectHandlers } = await import('../ipc/handlers/project')
const { default: generateHandlers } = await import('../ipc/handlers/generate')
const { default: scenarioHandlers } = await import('../ipc/handlers/scenario')
const { default: jobHandlers } = await import('../ipc/handlers/jobs')
const { jobs } = await import('../jobs/manager')
const { resetSettingsCache } = await import('../settings/store')
const { resetResolveState } = await import('../providers/resolve')
const { clearMockResponses, setMockResponse } = await import('../providers/mock/adapter')
const { setPipelineDeps } = await import('./deps')
const { getScenario, readScenarioDoc, saveScenario } = await import('../scenario/store')

const handlers = { ...projectHandlers, ...generateHandlers, ...scenarioHandlers, ...jobHandlers }

async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

let projectPath: string

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-gen-'))
  projectPath = (await invoke('project:create', { parentDir, name: 'NCIA', orgType: 'airport' }))
    .path
  const index = new FakeNciaIndex()
  setPipelineDeps({ openIndex: async () => index })
  setMockResponse('MselPhaseOutput', mselResponder)
  setMockResponse('RubricOutput', () => RUBRIC)
})
afterEach(() => {
  clearMockResponses()
  setPipelineDeps(undefined)
})

const brief = {
  userPrompt: 'AODB tampering misleads FIDS, BHS and PA',
  audience: ['Airport Operations', 'IT', 'PIO', 'Security'],
  durationHours: 4,
  phaseCount: 4,
  learningObjectives: [],
  constraints: [],
  startWallClock: '09:00',
}

async function generate(): Promise<Scenario> {
  const { jobId, scenarioId } = await invoke('generate:scenario', { projectPath, brief })
  const job = await jobs.wait(jobId)
  expect(job.status, job.error).toBe('done')
  return getScenario(projectPath, scenarioId)
}

const userOf = (req: ChatRequest): string => req.messages[0]!.content

const injectRun = (stage: 'inject_text' | 'media_render', itemId: string): StageRun => ({
  stage,
  itemId,
  startedAt: '2026-10-01T00:00:00.000Z',
  finishedAt: '2026-10-01T00:00:01.000Z',
  status: 'ok',
  repairAttempts: 0,
})

/** Link injects to rows the way the inject job does: row.injectId plus ok runs. */
async function linkInjects(s: Scenario, links: Record<string, string>): Promise<Scenario> {
  for (const row of s.msel) if (links[row.id]) row.injectId = links[row.id]
  for (const id of Object.values(links))
    s.provenance.push(injectRun('inject_text', id), injectRun('media_render', id))
  return saveScenario(projectPath, s, { by: 'ai', snapshot: false })
}

const statusOf = (s: Scenario, stage: string, itemId: string) =>
  s.provenance.find((r) => r.stage === stage && r.itemId === itemId)?.status

describe('inject staleness after MSEL re-runs (#207)', () => {
  it('re-running a phase marks the injects of changed and removed rows stale, others stay ok', async () => {
    const s = await linkInjects(await generate(), {
      'I-06': 'INJ-06',
      'I-06b': 'INJ-06B',
      'I-07': 'INJ-07',
    })
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      const out = mselResponder(req)
      if (!userOf(req).includes('NOW WRITE PHASE 2')) return out
      const rows = out.rows
        .filter((r) => r.id !== 'I-06b')
        .map((r) =>
          r.id === 'I-07'
            ? {
                ...r,
                event: 'Phone Call: BHS sortation down; every Concourse A bag to Manual Encode.',
              }
            : r,
        )
      return { rows } satisfies MselPhaseOutput
    })
    const { jobId } = await invoke('generate:rerun-stage', {
      projectPath,
      scenarioId: s.id,
      stage: 'msel_phase',
      itemId: s.phases[1]!.id,
    })
    const job = await jobs.wait(jobId)
    expect(job.status, job.error).toBe('done')
    const after = await getScenario(projectPath, s.id)
    expect(statusOf(after, 'inject_text', 'INJ-07')).toBe('stale')
    expect(statusOf(after, 'media_render', 'INJ-07')).toBe('stale')
    expect(statusOf(after, 'inject_text', 'INJ-06B')).toBe('stale')
    expect(statusOf(after, 'inject_text', 'INJ-06')).toBe('ok')
    expect(statusOf(after, 'media_render', 'INJ-06')).toBe('ok')
    const log = jobs.logOf(jobId).entries.map((e) => e.message)
    expect(log.some((m) => /Injects marked stale.*I-07 changed.*I-06b removed/.test(m))).toBe(true)
  })
})

describe('documents are written only when the step commits (#209)', () => {
  it('a critique cancelled during its second revision round leaves overview.md unchanged', async () => {
    const s = await generate()
    const overviewBefore = await readScenarioDoc(projectPath, s.id, 'overview')
    const handbookBefore = await readScenarioDoc(projectPath, s.id, 'handbook')
    expect(overviewBefore).toContain('I-07')
    let opened: () => void = () => undefined
    const gate = new Promise<void>((r) => (opened = r))
    let revisions = 0
    let reachedSecond = false
    setMockResponse('CritiqueOutput', () => ({
      issues: [
        {
          severity: 'error',
          rowId: 'I-07',
          message: 'BHS call contradicts I-06.',
          suggestion: 'Move it after the PA inject.',
        },
      ],
      summary: 'Fix I-07.',
    }))
    setMockResponse('MselPhaseOutput', async (req: ChatRequest) => {
      if (!userOf(req).includes('REVISION PASS')) return mselResponder(req)
      revisions += 1
      if (revisions > 1) {
        reachedSecond = true
        await gate
        req.signal?.throwIfAborted()
        return { rows: [] }
      }
      // The first revision writes the row in a player's voice, so a second round follows.
      return {
        rows: [
          {
            id: 'I-07',
            time: '1:30',
            from: 'BHS Control Room',
            to: ['ops'],
            event: 'Phone Call: "I have made the decision to stop every Concourse A belt now."',
            expectedAction: 'Ops coordinates manual baggage handling.',
            purposeTag: 'CORE_NARRATIVE',
            format: 'phone_call',
            citations: [],
          },
        ],
      }
    })
    const { jobId } = await invoke('generate:rerun-stage', {
      projectPath,
      scenarioId: s.id,
      stage: 'critique',
    })
    await vi.waitFor(() => expect(reachedSecond).toBe(true))
    await invoke('jobs:cancel', { jobId })
    opened()
    expect((await jobs.wait(jobId)).status).toBe('cancelled')
    expect(await readScenarioDoc(projectPath, s.id, 'overview')).toBe(overviewBefore)
    expect(await readScenarioDoc(projectPath, s.id, 'handbook')).toBe(handbookBefore)
    const after = await getScenario(projectPath, s.id)
    expect(after.msel).toEqual(s.msel)
  })

  it('a successful critique revision writes overview.md after the checkpoint', async () => {
    setMockResponse('CritiqueOutput', () => ({
      issues: [{ severity: 'error', rowId: 'I-07', message: 'Weak.', suggestion: 'Use a memo.' }],
      summary: 'Fix I-07.',
    }))
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      if (!userOf(req).includes('REVISION PASS')) return mselResponder(req)
      return {
        rows: [
          {
            id: 'I-07',
            time: '1:30',
            from: 'BHS Control Room',
            to: ['ops'],
            event: 'Memo: sortation controller corrupted; Concourse A bags go to Manual Encode.',
            expectedAction: 'Ops authorizes manual baggage handling.',
            purposeTag: 'CORE_NARRATIVE',
            format: 'memo',
            citations: [],
          },
        ],
      }
    })
    const s = await generate()
    expect(s.documents.overview).toBeTruthy()
    expect(s.documents.hotwash).toBeTruthy()
    const overview = await readScenarioDoc(projectPath, s.id, 'overview')
    expect(overview).toContain('Memo: sortation controller corrupted')
  })
})

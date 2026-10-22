// The real resumers registered by ipc/handlers/generate.ts (#90 bug 2): a rerun-stage job
// interrupted by an app exit resumes as the same re-run, with the designer's instructions.
// Own file: the jobs singleton reads userData/jobs.json once, on first use.
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import type { Job } from '@shared/schemas'
import type { ChatRequest } from '../providers/types'
import type { JobContext } from '../jobs/manager'
import { FakeNciaIndex } from '../../../tests/fixtures/generate/fakes'
import { RUBRIC, mselResponder } from '../../../tests/fixtures/generate/stage-fixtures'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

process.env.TTX_MOCK_PROVIDERS = '1'
process.env.TTX_RESOURCES = resolve(process.cwd())
process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))

const { dispatch } = await import('../ipc/registry')
const { default: projectHandlers } = await import('../ipc/handlers/project')
const { default: generateHandlers } = await import('../ipc/handlers/generate')
const { default: jobHandlers } = await import('../ipc/handlers/jobs')
const { jobs } = await import('../jobs/manager')
const { setMockResponse } = await import('../providers/mock/adapter')
const { setPipelineDeps } = await import('./deps')
const { getScenario } = await import('../scenario/store')
const { runFor, runPipeline } = await import('./engine')

const handlers = { ...projectHandlers, ...generateHandlers, ...jobHandlers }

async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

const quietCtx = (): JobContext => ({
  jobId: 'direct',
  signal: new AbortController().signal,
  progress: () => undefined,
  log: () => undefined,
  token: () => undefined,
  throwIfCancelled: () => undefined,
})

describe('resuming an interrupted rerun-stage job', () => {
  it('re-runs the same step with the saved instructions and does not auto-run stale steps', async () => {
    const index = new FakeNciaIndex()
    setPipelineDeps({ openIndex: async () => index })
    setMockResponse('MselPhaseOutput', mselResponder)
    setMockResponse('RubricOutput', () => RUBRIC)
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-gen-'))
    const projectPath = (
      await invoke('project:create', { parentDir, name: 'NCIA', orgType: 'airport' })
    ).path
    const { scenarioId } = await (async () => {
      const deps = await (await import('./deps')).pipelineDeps()
      const s = await deps.store.createScenario(projectPath, {
        title: 'x',
        brief: {
          userPrompt: 'AODB tampering',
          audience: [],
          durationHours: 4,
          phaseCount: 4,
          learningObjectives: [],
          constraints: [],
        },
      })
      await runPipeline(projectPath, s.id, quietCtx())
      return { scenarioId: s.id }
    })()

    const prompts: string[] = []
    setMockResponse('PhasePlanOutput', (req: ChatRequest) => {
      prompts.push(req.messages[0]!.content)
      return {
        phases: [
          { title: 'Early', goal: 'g1', startTime: '0:00', endTime: '2:00', beats: ['a'] },
          { title: 'Late', goal: 'g2', startTime: '2:00', endTime: '4:00', beats: ['b'] },
        ],
      }
    })
    const interrupted: Job = {
      id: 'J1',
      kind: 'rerun-stage',
      status: 'running',
      progress: 0.1,
      message: 'Re-running phase_plan',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      resumable: true,
      projectPath,
      scenarioId,
      payload: { stage: 'phase_plan', instructions: 'Use two phases only.' },
    }
    writeFileSync(
      join(process.env.TTX_USER_DATA!, 'jobs.json'),
      JSON.stringify({ jobs: [interrupted] }),
    )

    const { jobId } = await invoke('jobs:resume', { jobId: 'J1' })
    const job = await jobs.wait(jobId)
    expect(job.status, job.error).toBe('done')
    expect(job.kind).toBe('rerun-stage')
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('Use two phases only.')
    const s = await getScenario(projectPath, scenarioId)
    expect(s.phases.map((p) => p.title)).toEqual(['Early', 'Late'])
    expect(runFor(s, { stage: 'phase_plan' })?.status).toBe('ok')
    expect(runFor(s, { stage: 'rubric' })?.status).toBe('stale')
    expect(s.status).toBe('draft')
  })
})

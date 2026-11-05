// A classroom make-up version keeps the original's objectives through the normal pipeline
// (#730, spec 0453 FR-7): same mock provider and shipped prompts as engine.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
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
const { default: jobHandlers } = await import('../ipc/handlers/jobs')
const { jobs } = await import('../jobs/manager')
const { resetSettingsCache } = await import('../settings/store')
const { resetResolveState } = await import('../providers/resolve')
const { clearMockResponses, setMockResponse } = await import('../providers/mock/adapter')
const { setPipelineDeps } = await import('./deps')
const { getScenario } = await import('../scenario/store')
const { makeupBrief, carriedOver, MAKEUP_CONSTRAINT } = await import('../classroom/makeup')

const handlers = { ...projectHandlers, ...generateHandlers, ...jobHandlers }

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
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-mk-'))
  projectPath = (await invoke('project:create', { parentDir, name: 'NCIA', orgType: 'airport' }))
    .path
  setPipelineDeps({ openIndex: async () => new FakeNciaIndex() })
  setMockResponse('MselPhaseOutput', mselResponder)
  setMockResponse('RubricOutput', () => RUBRIC)
})
afterEach(() => {
  clearMockResponses()
  setPipelineDeps(undefined)
})

const baseBrief = {
  userPrompt: 'AODB tampering misleads FIDS, BHS and PA',
  audience: ['Airport Operations', 'IT', 'PIO', 'Security'],
  durationHours: 4,
  phaseCount: 4,
  learningObjectives: [],
  constraints: [],
  startWallClock: '09:00' as const,
}

const fixed = [
  { id: 'FIX-1', name: 'Communication', text: 'Notify partners within 30 minutes.' },
  { id: 'FIX-2', name: 'Decisions', text: 'Decide on manual boarding with stated reasons.' },
  { id: 'FIX-3', name: 'Coordination', text: 'Coordinate IT and operations on one picture.' },
]

describe('make-up pipeline', () => {
  it('restores the fixed objectives exactly, whatever the model wrote', async () => {
    const brief = makeupBrief({
      id: 'orig',
      brief: { ...baseBrief, drillOf: undefined } as never,
      objectives: fixed,
    })
    const { jobId, scenarioId } = await invoke('generate:scenario', { projectPath, brief })
    const job = await jobs.wait(jobId)
    expect(job.status, job.error).toBe('done')
    const s = await getScenario(projectPath, scenarioId)
    expect(s.objectives).toEqual(fixed.map((o) => ({ ...o })))
    expect(s.brief.makeupOf).toBe('orig')
    expect(s.brief.constraints).toContain(MAKEUP_CONSTRAINT)
  })
})

describe('makeupBrief and carriedOver', () => {
  it('asks for different facts once, and feeds the objective texts to the prompt', () => {
    const once = makeupBrief({ id: 'a', brief: { ...baseBrief } as never, objectives: fixed })
    const twice = makeupBrief({ id: 'b', brief: once, objectives: fixed })
    expect(twice.constraints.filter((c) => c === MAKEUP_CONSTRAINT)).toHaveLength(1)
    expect(twice.learningObjectives).toEqual(fixed.map((o) => o.text))
    expect(twice.makeupOf).toBe('b')
  })

  it('carries objective and capability mappings and the session, not tasks or seats', () => {
    const maps = [
      { outcomeId: 'o1', kind: 'objective', ref: 'FIX-1', confirmed: true, scenarioId: 'a' },
      { outcomeId: 'o1', kind: 'task', ref: 'T-01', confirmed: true, scenarioId: 'a' },
      { outcomeId: 'o2', kind: 'objective', ref: 'X', confirmed: true, scenarioId: 'other' },
    ] as never
    const session = {
      scenarioId: 'a',
      sectionId: 's',
      practice: true,
      seats: { ic: 'st1' },
      rubricIds: ['r1'],
    }
    const got = carriedOver(maps, session as never, 'a', 'b')
    expect(got.mappings).toEqual([
      { outcomeId: 'o1', kind: 'objective', ref: 'FIX-1', confirmed: true, scenarioId: 'b' },
    ])
    expect(got.session).toEqual({
      scenarioId: 'b',
      sectionId: 's',
      practice: false,
      seats: {},
      rubricIds: ['r1'],
      makeupOf: 'a',
    })
  })
})

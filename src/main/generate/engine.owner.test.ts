// Regional exercises (#497): generation never changes a row another organization owns. Runs the
// real pipeline over the mock provider with a model that tries to rewrite and drop partner rows.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import type { MselPhaseOutput, MselRow, Scenario } from '@shared/schemas'
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
const { getScenario, saveScenario } = await import('../scenario/store')
const { writeRegional } = await import('../regional/store')

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
const PARTNER_ROWS = ['I-06', 'I-07']

/** Make I-06 and I-07 the partner's rows in a regional exercise this project joined as CITY. */
async function joinAsCity(s: Scenario): Promise<MselRow[]> {
  for (const row of s.msel)
    if (PARTNER_ROWS.includes(row.id)) Object.assign(row, { owner: 'air', revision: 3 })
  const saved = await saveScenario(projectPath, s, { by: 'ai', snapshot: false })
  await writeRegional(projectPath, s.id, {
    exerciseId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    role: 'participant',
    thisOrg: 'city',
    hostOrg: 'air',
    orgs: [
      { orgId: 'air', name: 'Harborview Airport Authority', prefix: 'AIR' },
      { orgId: 'city', name: 'Cleveland Office of Emergency Management', prefix: 'CITY' },
    ],
    frameVersion: 1,
    final: false,
    received: {},
    shareQuotes: false,
    shareFullLog: false,
    crossOrgChannels: [],
    proposals: [],
    local: { slice: 0, rows: {}, injects: {} },
  })
  return saved.msel.filter((r) => PARTNER_ROWS.includes(r.id))
}

const partnerRows = (s: Scenario): MselRow[] => s.msel.filter((r) => PARTNER_ROWS.includes(r.id))

async function runJob(channel: 'generate:rerun-stage', req: object) {
  const { jobId } = await invoke(channel, req as never)
  const job = await jobs.wait(jobId)
  expect(job.status, job.error).toBe('done')
  return jobId
}

describe('generation keeps partner-owned rows unchanged (#497)', () => {
  it('a re-run phase rewrites and drops no partner row, but still changes the rows it owns', async () => {
    const s = await generate()
    const before = await joinAsCity(s)
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      const out = mselResponder(req)
      if (!userOf(req).includes('NOW WRITE PHASE 2')) return out
      const rows = out.rows
        .filter((r) => r.id !== 'I-06' && r.id !== 'I-06b')
        .map((r) => (r.id === 'I-07' ? { ...r, event: 'Phone Call: the model rewrote this.' } : r))
      return { rows } satisfies MselPhaseOutput
    })
    const jobId = await runJob('generate:rerun-stage', {
      projectPath,
      scenarioId: s.id,
      stage: 'msel_phase',
      itemId: s.phases[1]!.id,
    })
    const after = await getScenario(projectPath, s.id)
    expect(partnerRows(after)).toEqual(before)
    expect(after.msel.some((r) => r.id === 'I-06b')).toBe(false)
    expect(jobs.logOf(jobId).entries.some((e) => /partner rows/.test(e.message))).toBe(true)
  })

  it('a critique revision does not rewrite a partner row it flagged', async () => {
    const s = await generate()
    const before = await joinAsCity(s)
    setMockResponse('CritiqueOutput', () => ({
      issues: [
        { severity: 'error', rowId: 'I-07', message: 'Contradicts I-06.', suggestion: 'Fix it.' },
      ],
      summary: 'Fix I-07.',
    }))
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      if (!userOf(req).includes('REVISION PASS')) return mselResponder(req)
      const rows = mselResponder(req).rows.filter((r) => r.id === 'I-07')
      return { rows: rows.map((r) => ({ ...r, event: 'Phone Call: revised by the model.' })) }
    })
    await runJob('generate:rerun-stage', { projectPath, scenarioId: s.id, stage: 'critique' })
    expect(partnerRows(await getScenario(projectPath, s.id))).toEqual(before)
  })

  it('the repair pass leaves a misplaced partner row where its owner put it', async () => {
    const s = await generate()
    s.msel.find((r) => r.id === 'I-07')!.time = '3:55'
    const before = await joinAsCity(s)
    const { repairMsel } = await import('./repair-msel')
    const ctx = {
      jobId: 'test',
      signal: new AbortController().signal,
      progress: () => undefined,
      log: () => undefined,
      token: () => undefined,
      throwIfCancelled: () => undefined,
    }
    await repairMsel(projectPath, s.id, ctx)
    expect(partnerRows(await getScenario(projectPath, s.id))).toEqual(before)
  })

  it('a scenario outside a regional exercise is rewritten as before', async () => {
    const s = await generate()
    setMockResponse('MselPhaseOutput', (req: ChatRequest) => {
      const out = mselResponder(req)
      if (!userOf(req).includes('NOW WRITE PHASE 2')) return out
      const rows = out.rows.map((r) => (r.id === 'I-07' ? { ...r, event: 'Phone Call: new.' } : r))
      return { rows } satisfies MselPhaseOutput
    })
    await runJob('generate:rerun-stage', {
      projectPath,
      scenarioId: s.id,
      stage: 'msel_phase',
      itemId: s.phases[1]!.id,
    })
    const row = (await getScenario(projectPath, s.id)).msel.find((r) => r.id === 'I-07')
    expect(row?.event).toBe('Phone Call: new.')
  })
})

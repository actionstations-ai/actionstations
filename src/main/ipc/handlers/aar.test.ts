// Integration: aar channels through the IPC dispatcher against a real project folder, with the
// mock provider drafting from a facilitator record. The mock fixture cites note:I-06, note:I-09
// and note:general plus one ref the record does not have, so the unsupported finding is dropped.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Aar } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_MOCK_PROVIDERS = '1'
process.env.TTX_RESOURCES = resolve(process.cwd())

const { dispatch } = await import('../registry')
const handlers = (await import('./aar')).default
const { jobs } = await import('../../jobs/manager')
const { resetSettingsCache } = await import('../../settings/store')
const { resetResolveState } = await import('../../providers/resolve')
const { setPipelineDeps } = await import('../../generate/deps')
const { FakeNciaIndex } = await import('../../../../tests/fixtures/generate/fakes')
const { createProject } = await import('../../project/store')
const { createScenario, readScenarioDoc, saveScenario } = await import('../../scenario/store')
const { writeFacilitatorState } = await import('../../facilitator/state')
const { Scenario, ScenarioBrief } = await import('@shared/schemas')

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  setPipelineDeps({ openIndex: async () => new FakeNciaIndex() })
  const parent = mkdtempSync(join(tmpdir(), 'ttx-aarh-'))
  const { path: projectPath } = await createProject({ parentDir: parent, name: 'NCIA', orgType: 'airport' })
  const created = await createScenario(projectPath, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  await saveScenario(
    projectPath,
    Scenario.parse({ ...FIXTURE, id: created.id, projectId: created.projectId }),
    { by: 'user' },
  )
  return { projectPath, scenarioId: created.id }
}
afterEach(() => setPipelineDeps(undefined))

const notes = {
  elapsedMin: 225,
  delivered: { 'I-06': { at: '2026-10-28T14:15:00.000Z', exerciseTime: '1:15' } },
  notes: { 'I-06': 'PA silenced in four minutes.', 'I-09': 'Go Dark decided in the IT room.' },
  generalNotes: 'Room started late.',
  hotwash: [],
  decisions: [],
}

async function ok<T>(name: string, req: unknown): Promise<T> {
  const r = await dispatch(handlers, name, req)
  if (!r.ok) throw new Error(`${name}: ${r.error.code} ${r.error.message}`)
  return r.data as T
}

describe('aar handlers', () => {
  it('answers null before a draft and lists no live sessions', async () => {
    const { projectPath, scenarioId } = await setup()
    expect(await ok('aar:get', { projectPath, scenarioId })).toBeNull()
    expect(await ok('aar:sessions', { projectPath, scenarioId })).toEqual([])
    const record = await ok<{ sources: { facilitator: boolean } }>('aar:record', { projectPath, scenarioId })
    expect(record.sources.facilitator).toBe(false)
  })

  it('refuses to draft from an empty record', async () => {
    const { projectPath, scenarioId } = await setup()
    const { jobId } = await ok<{ jobId: string }>('aar:draft', { projectPath, scenarioId })
    const job = await jobs.wait(jobId)
    expect(job.status).toBe('error')
    expect(job.error).toMatch(/Nothing to draft from/)
  })

  it('drafts from facilitator notes, drops the unsupported finding and renders the document', async () => {
    const { projectPath, scenarioId } = await setup()
    await writeFacilitatorState(projectPath, scenarioId, notes)
    const { jobId } = await ok<{ jobId: string }>('aar:draft', { projectPath, scenarioId, instructions: 'Short.' })
    const job = await jobs.wait(jobId)
    expect(job.status, job.error).toBe('done')
    const aar = (await ok<Aar>('aar:get', { projectPath, scenarioId }))!
    expect(aar.sourcesUsed).toEqual(['facilitator'])
    const coord = aar.capabilities.find((c) => c.capability === 'operational_coordination')!
    expect(coord.proposedRating).toBe('S')
    expect(coord.rating).toBeUndefined()
    expect(coord.strengths.map((f) => f.title)).toEqual(['Incident command established early'])
    expect(coord.areasForImprovement[0]!.correctiveActions[0]).toMatchObject({ ownerRole: 'ops-director', element: 'planning', ownerOrganization: '' })
    expect(aar.capabilities.find((c) => c.capability === 'cybersecurity')!.proposedRating).toBeUndefined()
    const log = jobs.logOf(jobId).entries.map((e) => e.message).join('\n')
    expect(log).toContain('AAR_UNSUPPORTED_FINDING: "Unsupported finding"')
    expect(log).toContain('note:I-99')
    const md = await readScenarioDoc(projectPath, scenarioId, 'aar')
    expect(md).toContain('## Appendix A: Improvement Plan')
    expect(md).toContain('Revise TIRP 13.6 so the Go Dark decision')
    expect(existsSync(join(projectPath, 'scenarios', scenarioId, 'aar.json'))).toBe(true)
  })

  it('saves a confirmed rating with a stale check and re-renders the rating table', async () => {
    const { projectPath, scenarioId } = await setup()
    await writeFacilitatorState(projectPath, scenarioId, notes)
    const { jobId } = await ok<{ jobId: string }>('aar:draft', { projectPath, scenarioId })
    await jobs.wait(jobId)
    const aar = (await ok<Aar>('aar:get', { projectPath, scenarioId }))!
    const confirmed = {
      ...aar,
      capabilities: aar.capabilities.map((c) => (c.capability === 'operational_coordination' ? { ...c, rating: 'S' as const } : c)),
    }
    const saved = await ok<Aar>('aar:save', { projectPath, scenarioId, aar: confirmed, baseUpdatedAt: aar.updatedAt })
    expect(saved.capabilities[0]!.rating).toBe('S')
    const md = await readScenarioDoc(projectPath, scenarioId, 'aar')
    expect(md).toContain('| Decision Making | Operational Coordination |  | X |  |  |  |')
    const stale = await dispatch(handlers, 'aar:save', { projectPath, scenarioId, aar: confirmed, baseUpdatedAt: aar.updatedAt })
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('lists live sessions and reads the chosen one into the record without names', async () => {
    const { projectPath, scenarioId } = await setup()
    const dir = join(projectPath, 'scenarios', scenarioId, 'live', 'run1')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'log.jsonl'), readFileSync(resolve('tests/fixtures/live/session-scenario-3.jsonl')))
    const sessions = await ok<{ id: string; entries: number; endedAt?: string }[]>('aar:sessions', { projectPath, scenarioId })
    expect(sessions).toEqual([expect.objectContaining({ id: 'run1', entries: 40 })])
    expect(sessions[0]!.endedAt).toBeTruthy()
    const record = await ok<{ sources: { live: boolean }; liveSessionId: string; votes: unknown[] }>('aar:record', { projectPath, scenarioId, sessionId: 'run1' })
    expect(record.sources.live).toBe(true)
    expect(record.liveSessionId).toBe('run1')
    expect(record.votes).toHaveLength(1)
    expect(JSON.stringify(record)).not.toContain('Dana Whitfield')
  })
})

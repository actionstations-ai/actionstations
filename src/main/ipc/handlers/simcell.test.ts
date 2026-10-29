// Integration (#429): the SimCell channels through the IPC dispatcher on a real project folder,
// with the offline mock provider. Checks persona saving and the real-name refusal, the offline
// turn and its approval, the capability check, and that nothing is saved before a person resolves.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { PersonasFile, SimcellDraft } from '@shared/schemas'

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
const handlers = (await import('./simcell')).default
const { jobs } = await import('../../jobs/manager')
const { createProject } = await import('../../project/store')
const { createScenario, saveScenario } = await import('../../scenario/store')
const { readFacilitatorState } = await import('../../facilitator/state')
const { resetSettingsCache } = await import('../../settings/store')
const { resetResolveState } = await import('../../providers/resolve')
const { resetSimcell } = await import('../../simcell/registry')
const { Scenario, ScenarioBrief } = await import('@shared/schemas')

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  resetSimcell()
  const parent = mkdtempSync(join(tmpdir(), 'ttx-simcell-'))
  const { path: root } = await createProject({
    parentDir: parent,
    name: 'NCIA',
    orgType: 'airport',
  })
  const created = await createScenario(root, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  await saveScenario(
    root,
    Scenario.parse({
      ...FIXTURE,
      id: created.id,
      projectId: created.projectId,
      simcellScripts: [
        {
          rolePlayed: 'Local TV reporter',
          trigger: 'After the first statement',
          hardQuestions: ['Is anyone in danger?'],
          concessions: ['Hold the story for one hour'],
        },
      ],
    }),
    { by: 'user' },
  )
  const call = async <T>(channel: string, req: Record<string, unknown> = {}) =>
    (await dispatch(handlers, channel as never, {
      projectPath: root,
      scenarioId: created.id,
      ...req,
    })) as Result<T>
  const ok = async <T>(channel: string, req: Record<string, unknown> = {}) => {
    const r = await call<T>(channel, req)
    if (!r.ok) throw new Error(`${channel}: ${r.error.code} ${r.error.message}`)
    return r.data
  }
  return { root, scenarioId: created.id, call, ok }
}

/** The reporter card from the scripts, with the goal a draft needs. */
async function withGoal(env: Awaited<ReturnType<typeof setup>>) {
  const { proposal } = await env.ok<{ proposal: PersonasFile }>('simcell:personas-from-scripts', {})
  const card = {
    ...proposal.personas[0]!,
    displayName: 'Dana Whitlock',
    organization: { name: 'Harbor Ledger', fictional: true },
    goals: [{ id: 'g1', text: 'Publish before the evening edition.' }],
  }
  return env.ok<PersonasFile>('simcell:personas-save', { file: { version: 1, personas: [card] } })
}

describe('personas', () => {
  it('proposes cards from the SimCell scripts without saving them', async () => {
    const env = await setup()
    const { proposal } = await env.ok<{ proposal: PersonasFile }>(
      'simcell:personas-from-scripts',
      {},
    )
    expect(proposal.personas.map((p) => p.displayName)).toEqual(['Local TV reporter'])
    expect((await env.ok<PersonasFile>('simcell:personas-get')).personas).toEqual([])
  })

  it('saves and reads back, and refuses a public office holder by name', async () => {
    const env = await setup()
    const saved = await withGoal(env)
    expect((await env.ok<PersonasFile>('simcell:personas-get')).personas[0]!.id).toBe(
      saved.personas[0]!.id,
    )
    const bad = { ...saved.personas[0]!, displayName: 'Governor Ames' }
    const r = await env.call('simcell:personas-save', { file: { version: 1, personas: [bad] } })
    expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('fills the cards in a job with the model and returns them as a proposal', async () => {
    const env = await setup()
    const { jobId } = await env.ok<{ jobId: string }>('simcell:personas-from-scripts', {
      enrich: true,
    })
    const job = await jobs.wait(jobId!)
    expect(job.status, job.error).toBe('done')
    const proposal = job.result as PersonasFile
    expect(proposal.personas[0]).toMatchObject({ displayName: 'Dana Whitlock', kind: 'reporter' })
    expect((await env.ok<PersonasFile>('simcell:personas-get')).personas).toEqual([])
  })
})

describe('an offline turn', () => {
  it('drafts a reply and keeps the exchange only after a person approves it', async () => {
    const env = await setup()
    await withGoal(env)
    const draft = await env.ok<SimcellDraft>('simcell:offline-turn', {
      personaId: (await env.ok<PersonasFile>('simcell:personas-get')).personas[0]!.id,
      playerText: 'Can you give us until two?',
    })
    expect(draft).toMatchObject({ status: 'queued', threadId: 'offline' })
    expect((await readFacilitatorState(env.root, env.scenarioId)).simcell ?? []).toEqual([])

    await env.ok('simcell:resolve', {
      draftId: draft.id,
      action: 'edit',
      text: 'Not until two-thirty.',
    })
    const saved = (await readFacilitatorState(env.root, env.scenarioId)).simcell
    expect(saved).toMatchObject([
      { playerText: 'Can you give us until two?', replyText: 'Not until two-thirty.' },
    ])
  })

  it('will not draft for a persona with no goal', async () => {
    const env = await setup()
    const { proposal } = await env.ok<{ proposal: PersonasFile }>(
      'simcell:personas-from-scripts',
      {},
    )
    await env.ok('simcell:personas-save', { file: proposal })
    const r = await env.call('simcell:offline-turn', {
      personaId: proposal.personas[0]!.id,
      playerText: 'Hello',
    })
    expect(r).toMatchObject({ ok: false, error: { message: expect.stringContaining('goal') } })
  })
})

describe('the capability check', () => {
  it('has no result until it is run, then reports the level for the routed model', async () => {
    const env = await setup()
    expect(await env.ok('simcell:capability')).toBeNull()
    const { jobId } = await env.ok<{ jobId: string }>('simcell:capability-run')
    const job = await jobs.wait(jobId)
    expect(job.status, job.error).toBe('done')
    const view = await env.ok<{ level: string; labels: Record<string, string> }>(
      'simcell:capability',
    )
    expect(['suited', 'limited', 'not_suited']).toContain(view.level)
    expect(Object.keys(view.labels)).toHaveLength(8)
  })

  it('keeps drafting off for the session until the model passes', async () => {
    const env = await setup()
    const status = await env.ok<{ enabled: boolean; live: boolean }>('simcell:status')
    expect(status).toMatchObject({ enabled: false, live: false })
  })
})

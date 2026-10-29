// The draft-aar job (#419): the prompt carries the record with its refs and no identities, a
// reply with no JSON is retried once with the condensed record, a second one fails with the
// context-window message, and a re-draft keeps what a person decided.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AarOutput } from '@shared/schemas'
import type { ChatRequest } from '../providers/types'

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

const { draftAar } = await import('./draft')
const { readAar, writeAar } = await import('./store')
const { jobs } = await import('../jobs/manager')
const { resetSettingsCache } = await import('../settings/store')
const { resetResolveState } = await import('../providers/resolve')
const { setPipelineDeps } = await import('../generate/deps')
const { FakeNciaIndex, ScriptedProvider } = await import('../../../tests/fixtures/generate/fakes')
const { MOCK_FIXTURES } = await import('../providers/mock/fixtures')
const { createProject } = await import('../project/store')
const { createScenario, saveScenario } = await import('../scenario/store')
const { writeFacilitatorState } = await import('../facilitator/state')
const { Scenario, ScenarioBrief } = await import('@shared/schemas')

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>
const OUTPUT = MOCK_FIXTURES.AarOutput as AarOutput

async function setup(provider?: InstanceType<typeof ScriptedProvider>) {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  setPipelineDeps({
    openIndex: async () => new FakeNciaIndex(),
    ...(provider
      ? {
          resolveTextProvider: async () => ({
            provider,
            model: 'scripted',
            providerId: 'scripted',
          }),
        }
      : {}),
  })
  const parent = mkdtempSync(join(tmpdir(), 'ttx-draft-'))
  const { path: root } = await createProject({
    parentDir: parent,
    name: 'NCIA',
    orgType: 'airport',
  })
  const created = await createScenario(root, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  await saveScenario(
    root,
    Scenario.parse({ ...FIXTURE, id: created.id, projectId: created.projectId }),
    { by: 'user' },
  )
  await writeFacilitatorState(root, created.id, {
    elapsedMin: 225,
    delivered: {},
    notes: { 'I-06': 'PA silenced in four minutes.', 'I-09': 'Go Dark decided in the IT room.' },
    generalNotes: 'Room started late.',
    hotwash: [],
    decisions: [],
  })
  const live = join(root, 'scenarios', created.id, 'live', 'run1')
  mkdirSync(live, { recursive: true })
  writeFileSync(
    join(live, 'log.jsonl'),
    readFileSync(resolve('tests/fixtures/live/session-scenario-3.jsonl')),
  )
  return { root, scenarioId: created.id }
}
afterEach(() => setPipelineDeps(undefined))

const run = (root: string, scenarioId: string, instructions?: string) =>
  jobs.wait(
    jobs.start(
      'draft-aar',
      (ctx) => draftAar(root, scenarioId, instructions ? { instructions } : {}, ctx),
      { projectPath: root, scenarioId },
    ).id,
  )

const userOf = (req: ChatRequest): string => req.messages[0]!.content

describe('draftAar', () => {
  it('sends the record with refs and no live-play names, and keeps the job cheap', async () => {
    const provider = new ScriptedProvider(() => JSON.stringify(OUTPUT))
    const { root, scenarioId } = await setup(provider)
    const job = await run(root, scenarioId, 'Keep it short.')
    expect(job.status, job.error).toBe('done')
    expect(provider.requests).toHaveLength(1)
    const user = userOf(provider.requests[0]!)
    expect(user).toContain('<record>')
    expect(user).toContain('[note:I-06]')
    expect(user).toContain('[vote:')
    expect(user).toContain('[hw:hw_anon_boards')
    expect(user).toContain('Keep it short.')
    expect(user).toContain('- S1: ')
    for (const name of ['Dana Whitfield', 'Marcus Lee', 'Tom Okafor'])
      expect(user).not.toContain(name)
    const aar = (await readAar(root, scenarioId))!
    expect(aar.sourcesUsed).toEqual(['facilitator', 'live'])
    expect(aar.liveSessionId).toBe('run1')
    expect(aar.provenance).toHaveLength(1)
    expect(aar.provenance[0]).toMatchObject({ stage: 'aar', status: 'ok' })
  })

  it('retries once with the condensed record when the reply has no JSON', async () => {
    // The stage itself asks for one repair per call, so the full attempt is two empty replies.
    const provider = new ScriptedProvider((_req, i) => (i < 2 ? '' : JSON.stringify(OUTPUT)))
    const { root, scenarioId } = await setup(provider)
    const job = await run(root, scenarioId)
    expect(job.status, job.error).toBe('done')
    expect(provider.requests).toHaveLength(3)
    expect(userOf(provider.requests[2]!).length).toBeLessThan(userOf(provider.requests[0]!).length)
    const log = jobs
      .logOf(job.id)
      .entries.map((e) => e.message)
      .join('\n')
    expect(log).toContain('retrying with a condensed record')
  })

  it('fails with the context-window message when the condensed retry has no JSON either', async () => {
    const provider = new ScriptedProvider(() => 'I cannot write that much.')
    const { root, scenarioId } = await setup(provider)
    const job = await run(root, scenarioId)
    expect(job.status).toBe('error')
    expect(job.error).toMatch(/larger context/)
    expect(provider.requests).toHaveLength(4)
    expect(await readAar(root, scenarioId)).toBeNull()
  })

  it('re-drafts around confirmed ratings, locked rows and typed owners', async () => {
    const provider = new ScriptedProvider(() => JSON.stringify(OUTPUT))
    const { root, scenarioId } = await setup(provider)
    await run(root, scenarioId)
    const first = (await readAar(root, scenarioId))!
    const coord = first.capabilities.find((c) => c.capability === 'operational_coordination')!
    const area = coord.areasForImprovement[0]!
    await writeAar(
      root,
      scenarioId,
      {
        ...first,
        exerciseDate: '2026-10-28',
        participatingOrganizations: ['Skyline Air'],
        capabilities: first.capabilities.map((c) =>
          c.capability !== 'operational_coordination'
            ? c
            : {
                ...c,
                rating: 'S',
                strengths: c.strengths.map((f) => ({ ...f, analysisMd: 'Edited.', locked: true })),
                areasForImprovement: [
                  {
                    ...area,
                    correctiveActions: [
                      {
                        ...area.correctiveActions[0]!,
                        ownerOrganization: 'Airport Operations',
                        poc: 'Duty manager',
                        dueDate: '2027-03-31',
                      },
                      {
                        id: 'extra',
                        action: 'Buy whiteboards',
                        element: 'equipment',
                        ownerOrganization: 'Facilities',
                        poc: '',
                        status: 'open',
                        locked: true,
                      },
                    ],
                  },
                ],
              },
        ),
      },
      { by: 'user' },
    )
    const job = await run(root, scenarioId)
    expect(job.status, job.error).toBe('done')
    const second = (await readAar(root, scenarioId))!
    const again = second.capabilities.find((c) => c.capability === 'operational_coordination')!
    expect(again.rating).toBe('S')
    expect(again.strengths[0]!.analysisMd).toBe('Edited.')
    const actions = again.areasForImprovement[0]!.correctiveActions
    expect(actions[0]).toMatchObject({
      ownerOrganization: 'Airport Operations',
      poc: 'Duty manager',
      dueDate: '2027-03-31',
    })
    expect(actions.at(-1)).toMatchObject({ id: 'extra', locked: true })
    expect(second.exerciseDate).toBe('2026-10-28')
    expect(second.participatingOrganizations).toEqual(['Skyline Air'])
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.provenance).toHaveLength(2)
  })
})

// "Propose next inject" (spec 0430 FR-10): the model returns a draft row for a branch; the job
// result carries it and its hash, and neither scenario.json nor the facilitator state changes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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

const { runProposeInject } = await import('./propose-inject')
const { jobs } = await import('../jobs/manager')
const { resetSettingsCache } = await import('../settings/store')
const { resetResolveState } = await import('../providers/resolve')
const { setPipelineDeps } = await import('./deps')
const { FakeNciaIndex, ScriptedProvider } = await import('../../../tests/fixtures/generate/fakes')
const { createProject } = await import('../project/store')
const { createScenario, saveScenario } = await import('../scenario/store')
const { branchedScenario } = await import('@shared/branching/fixture')
const { proposalHash } = await import('@shared/branching/proposal')
const { ScenarioBrief } = await import('@shared/schemas')

const REPLY = {
  rows: [
    {
      id: 'I-99',
      time: '1:45',
      from: 'Vendor',
      to: ['all'],
      event: 'The vendor says the restore will take 9 more hours.',
      expectedAction: 'Decide whether to keep restoring or switch to manual procedures.',
      purposeTag: 'PRESSURE',
      format: 'text_message',
      citations: [],
    },
  ],
}

async function setup(provider: InstanceType<typeof ScriptedProvider>) {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  setPipelineDeps({
    openIndex: async () => new FakeNciaIndex(),
    resolveTextProvider: async () => ({ provider, model: 'scripted', providerId: 'scripted' }),
  })
  const parent = mkdtempSync(join(tmpdir(), 'ttx-prop-'))
  const { path: root } = await createProject({
    parentDir: parent,
    name: 'NCIA',
    orgType: 'airport',
  })
  const created = await createScenario(root, { title: 'Fork', brief: ScenarioBrief.parse({}) })
  const b = branchedScenario()
  await saveScenario(
    root,
    {
      ...created,
      phases: [{ id: 'p1', index: 0, title: 'One', goal: 'g', startTime: '0:00', endTime: '4:00' }],
      msel: b.msel,
      branches: b.branches,
    },
    { by: 'user' },
  )
  return { root, scenarioId: created.id }
}
afterEach(() => setPipelineDeps(undefined))

const propose = (root: string, scenarioId: string, branchId: string) =>
  jobs.wait(
    jobs.start('generate-injects', (ctx) => runProposeInject(root, scenarioId, { branchId }, ctx), {
      projectPath: root,
      scenarioId,
    }).id,
  )

const userOf = (req: ChatRequest): string => req.messages[0]!.content

describe('runProposeInject', () => {
  it('returns a draft row tagged to the branch, with a hash, and leaves scenario.json alone', async () => {
    const provider = new ScriptedProvider(() => JSON.stringify(REPLY))
    const { root, scenarioId } = await setup(provider)
    const file = join(root, 'scenarios', scenarioId, 'scenario.json')
    const before = readFileSync(file, 'utf8')
    const job = await propose(root, scenarioId, 'b1')
    expect(job.status, job.error).toBe('done')
    const result = job.result as { row: Record<string, unknown>; hash: string }
    expect(result.row).toMatchObject({
      branchId: 'b1',
      phaseId: 'p1',
      locked: false,
      from: 'Vendor',
      purposeTag: 'PRESSURE',
    })
    expect(result.hash).toBe(proposalHash(result.row as never))
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('shows the model the decision, the option taken and the branch rows, as data', async () => {
    const provider = new ScriptedProvider(() => JSON.stringify(REPLY))
    const { root, scenarioId } = await setup(provider)
    await propose(root, scenarioId, 'b1')
    const user = userOf(provider.requests[0]!)
    expect(user).toContain('Pay the ransom or rebuild?')
    expect(user).toContain('I-11a')
    expect(user).toContain('<branch_state>')
  })

  it('never lets the proposal end the exercise or sit before the decision', async () => {
    const reply = {
      rows: [{ ...REPLY.rows[0]!, time: '0:05', purposeTag: 'ENDEX', id: 'END' }],
    }
    const provider = new ScriptedProvider(() => JSON.stringify(reply))
    const { root, scenarioId } = await setup(provider)
    const job = await propose(root, scenarioId, 'b2')
    const row = (job.result as { row: { purposeTag: string; time: string; id: string } }).row
    expect(row.purposeTag).toBe('CORE_NARRATIVE')
    expect(row.time).toBe('1:30')
    expect(row.id).toBe('I-10-B2-4')
  })

  it('fails for a branch that does not exist', async () => {
    const provider = new ScriptedProvider(() => JSON.stringify(REPLY))
    const { root, scenarioId } = await setup(provider)
    const job = await propose(root, scenarioId, 'nope')
    expect(job.status).toBe('error')
    expect(provider.requests).toHaveLength(0)
  })
})

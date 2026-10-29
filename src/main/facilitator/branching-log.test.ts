// The local branching log: decisions are appended, replayed and checked against the hash the
// app wrote (spec 0430 FR-9).
import { appendFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject } = await import('../project/store')
const { createScenario, getScenario, saveScenario } = await import('../scenario/store')
const { appendBranchingEntries, checkBranchingReplay } = await import('./branching-log')
const { ScenarioBrief } = await import('@shared/schemas')
const { branchedScenario } = await import('@shared/branching/fixture')
const { record } = await import('@shared/branching/fixture')

let root: string
let scenarioId: string

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  root = (await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-bl-')), name: 'Fork' }))
    .path
  const s = await createScenario(root, { title: 'T', brief: ScenarioBrief.parse({}) })
  scenarioId = s.id
  const b = branchedScenario()
  await saveScenario(root, { ...s, msel: b.msel, branches: b.branches }, { by: 'user' })
})

const close = (optionId: string) => ({
  kind: 'decision.close' as const,
  ex: '1:30',
  data: { ...record('d1', optionId) },
})

describe('branching log', () => {
  it('has nothing to replay before anything is recorded', async () => {
    expect((await checkBranchingReplay(root, scenarioId)).status).toBe('no_log')
  })

  it('replays an untouched run and matches the hash the app wrote', async () => {
    await appendBranchingEntries(root, scenarioId, [
      { kind: 'inject.release', rowId: 'START', data: {} },
      close('pay'),
    ])
    const result = await checkBranchingReplay(root, scenarioId)
    expect(result.status).toBe('matches')
  })

  it('says the scenario changed when it is edited after the run', async () => {
    await appendBranchingEntries(root, scenarioId, [close('pay')])
    const s = await getScenario(root, scenarioId)
    await saveScenario(root, { ...s, title: 'Edited' }, { by: 'user' })
    expect((await checkBranchingReplay(root, scenarioId)).status).toBe('scenario_changed')
  })

  it('reports a mismatch when the log is edited behind the app', async () => {
    await appendBranchingEntries(root, scenarioId, [close('pay')])
    const line = JSON.stringify({
      i: 99,
      at: '2026-01-01T00:00:00.000Z',
      kind: 'decision.override',
      actor: { kind: 'controller' },
      data: record('d1', 'rebuild', { by: 'override' }),
    })
    appendFileSync(join(root, 'scenarios', scenarioId, 'live', 'local', 'log.jsonl'), line + '\n')
    expect((await checkBranchingReplay(root, scenarioId)).status).toBe('mismatch')
  })

  it('never writes a client id or key into the log', async () => {
    await expect(
      appendBranchingEntries(root, scenarioId, [
        { kind: 'decision.close', data: { clientId: 'abc' } },
      ]),
    ).rejects.toThrow(/forbidden field/)
  })
})

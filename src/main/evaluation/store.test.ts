import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Observation } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { readEvaluation, removeObservation, upsertObservation } = await import('./store')
const { createProject } = await import('../project/store')
const { createScenario } = await import('../scenario/store')
const { ScenarioBrief } = await import('@shared/schemas')

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-eval-'))
  const { path } = await createProject({ parentDir: parent, name: 'NCIA' })
  const s = await createScenario(path, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  return { root: path, scenarioId: s.id }
}

const observation = (id: string, over: Partial<Observation> = {}): Observation => ({
  id,
  at: '2026-10-28T14:00:00.000Z',
  exerciseTime: '1:15',
  rowId: 'I-06',
  taskId: 'T-02',
  criterionId: 'T-02',
  rating: 'partial',
  note: 'Silenced the PA after 12 minutes.',
  source: 'facilitate',
  ...over,
})

describe('evaluation store', () => {
  it('reads an empty record when no file exists and creates it on the first observation', async () => {
    const { root, scenarioId } = await setup()
    const file = join(root, 'scenarios', scenarioId, 'evaluation.json')
    expect(existsSync(file)).toBe(false)
    expect((await readEvaluation(root, scenarioId)).observations).toEqual([])
    const record = await upsertObservation(root, scenarioId, observation('O-1'))
    expect(record.observations).toHaveLength(1)
    expect(record.formatVersion).toBe(1)
    expect(JSON.parse(readFileSync(file, 'utf8')).observations[0].rating).toBe('partial')
  })

  it('replaces an observation by id and removes one', async () => {
    const { root, scenarioId } = await setup()
    await upsertObservation(root, scenarioId, observation('O-1'))
    await upsertObservation(root, scenarioId, observation('O-2', { rowId: 'I-09', rating: 'met' }))
    const changed = await upsertObservation(
      root,
      scenarioId,
      observation('O-1', { rating: 'not_met' }),
    )
    expect(changed.observations.map((o) => [o.id, o.rating])).toEqual([
      ['O-2', 'met'],
      ['O-1', 'not_met'],
    ])
    const removed = await removeObservation(root, scenarioId, 'O-2')
    expect(removed.observations.map((o) => o.id)).toEqual(['O-1'])
    expect((await readEvaluation(root, scenarioId)).observations).toHaveLength(1)
  })

  it('serializes concurrent writes so none is lost', async () => {
    const { root, scenarioId } = await setup()
    await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((id) =>
        upsertObservation(root, scenarioId, observation(`O-${id}`)),
      ),
    )
    const record = await readEvaluation(root, scenarioId)
    expect(record.observations.map((o) => o.id).sort()).toEqual(['O-a', 'O-b', 'O-c', 'O-d', 'O-e'])
  })

  it('keeps fields a newer build wrote (loose record)', async () => {
    const { root, scenarioId } = await setup()
    const { writeJsonAtomic } = await import('../lib/fs')
    await writeJsonAtomic(join(root, 'scenarios', scenarioId, 'evaluation.json'), {
      formatVersion: 1,
      observations: [],
      updatedAt: '2026-10-28T14:00:00.000Z',
      futureField: { kept: true },
    })
    const record = await upsertObservation(root, scenarioId, observation('O-1'))
    expect((record as Record<string, unknown>).futureField).toEqual({ kept: true })
  })
})

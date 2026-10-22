import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject } = await import('../project/store')
const { createScenario } = await import('../scenario/store')
const { ScenarioBrief } = await import('@shared/schemas')
const { readFacilitatorState, writeFacilitatorState, facilitatorStatePath } =
  await import('./state')

async function newScenario(): Promise<{ root: string; scenarioId: string }> {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-fac-'))
  const { path: root } = await createProject({ parentDir: parent, name: 'Facilitator' })
  const s = await createScenario(root, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  return { root, scenarioId: s.id }
}

describe('facilitator state store', () => {
  it('returns an empty state before anything was saved', async () => {
    const { root, scenarioId } = await newScenario()
    expect(await readFacilitatorState(root, scenarioId)).toEqual({
      elapsedMin: 0,
      delivered: {},
      notes: {},
      generalNotes: '',
    })
  })

  it('persists state to scenarios/<id>/facilitator.json and reads it back', async () => {
    const { root, scenarioId } = await newScenario()
    const state = {
      elapsedMin: 75,
      runningSince: '2026-10-21T14:00:00.000Z',
      delivered: { 'I-06': { at: '2026-10-21T14:01:00.000Z', exerciseTime: '1:15' } },
      notes: { 'I-06': 'Ops did not trust the board' },
      generalNotes: 'Start late by 5 minutes',
    }
    await writeFacilitatorState(root, scenarioId, state)
    const file = await facilitatorStatePath(root, scenarioId)
    expect(file).toBe(join(root, 'scenarios', scenarioId, 'facilitator.json'))
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(state)
    expect(await readFacilitatorState(root, scenarioId)).toEqual(state)
  })

  it('keeps the last of several concurrent saves', async () => {
    const { root, scenarioId } = await newScenario()
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        writeFacilitatorState(root, scenarioId, {
          elapsedMin: n,
          delivered: {},
          notes: {},
          generalNotes: `save ${n}`,
        }),
      ),
    )
    expect((await readFacilitatorState(root, scenarioId)).generalNotes).toBe('save 5')
  })

  it('rejects unknown scenarios and unsafe ids', async () => {
    const { root } = await newScenario()
    await expect(readFacilitatorState(root, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(readFacilitatorState(root, '../x')).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

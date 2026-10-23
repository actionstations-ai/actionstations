// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { AppSettings } from '@shared/schemas/settings'
import { PROJECT, mockTtx, type Handlers } from '../documents/test-utils'
import { continueAfter } from './auto-continue'

const job = (id: string, kind: string) => ({
  id,
  kind,
  status: 'done',
  projectPath: PROJECT,
  scenarioId: 'scen1',
  progress: 1,
  message: 'Done',
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
  resumable: false,
})

function setup(auto: boolean, extra: Handlers = {}) {
  return mockTtx({
    'settings:get': () => AppSettings.parse({ generation: { autoInjectsAndMedia: auto } }),
    'jobs:get': (req: { jobId: string }) =>
      job(
        req.jobId,
        req.jobId.startsWith('GEN') ? 'generate-scenario' : 'generate-injects',
      ) as never,
    'generate:injects': () => ({ jobId: 'INJ1' }),
    'generate:media': () => ({ jobId: 'MED1' }),
    ...extra,
  })
}

describe('automatic injects and media after generation (#227)', () => {
  it('is off by default', () => {
    expect(AppSettings.parse({}).generation.autoInjectsAndMedia).toBe(false)
  })

  it('does nothing when the setting is off', async () => {
    const ttx = setup(false)
    const started = await continueAfter(
      { jobId: 'GEN1', kind: 'generate-scenario', status: 'done' },
      new Set(),
    )
    expect(started).toBeUndefined()
    expect(ttx.calls('generate:injects')).toHaveLength(0)
  })

  it('writes injects after generation, then renders media after those injects', async () => {
    const ttx = setup(true)
    const auto = new Set<string>()
    expect(
      await continueAfter({ jobId: 'GEN1', kind: 'generate-scenario', status: 'done' }, auto),
    ).toBe('INJ1')
    expect(ttx.calls('generate:injects')[0]).toEqual({ projectPath: PROJECT, scenarioId: 'scen1' })
    expect(
      await continueAfter({ jobId: 'INJ1', kind: 'generate-injects', status: 'done' }, auto),
    ).toBe('MED1')
    expect(ttx.calls('generate:media')[0]).toEqual({ projectPath: PROJECT, scenarioId: 'scen1' })
    expect(auto.size).toBe(0)
  })

  it('leaves inject jobs the designer started, and failed generations, alone', async () => {
    const ttx = setup(true)
    await continueAfter({ jobId: 'INJ9', kind: 'generate-injects', status: 'done' }, new Set())
    await continueAfter({ jobId: 'GEN2', kind: 'generate-scenario', status: 'error' }, new Set())
    expect(ttx.calls('generate:media')).toHaveLength(0)
    expect(ttx.calls('generate:injects')).toHaveLength(0)
  })
})

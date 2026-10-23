// #206 / review M11: while a generation job owns a scenario, every channel that writes that
// scenario (or its injects, documents or media) answers CONFLICT, and nothing is written.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, ChannelRequest } from '@shared/ipc'
import type { Inject, Scenario } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { dispatch } = await import('../registry')
const project = (await import('./project')).default
const scenario = (await import('./scenario')).default
const injects = (await import('./injects')).default
const render = (await import('./render')).default
const generate = (await import('./generate')).default
const { claimScenario } = await import('../../scenario/busy')
const { resetSettingsCache } = await import('../../settings/store')

const WRITE_CHANNELS: Channel[] = [
  'scenarios:save',
  'scenarios:delete',
  'scenarios:doc-save',
  'scenarios:history-restore',
  'injects:save',
  'injects:create',
  'injects:delete',
  'injects:restore-version',
  'injects:regenerate-text',
  'injects:regenerate-media',
  'library:insert',
  'render:inject',
  'generate:continue',
  'generate:injects',
  'generate:media',
  'generate:repair',
]

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

const handlers = { ...project, ...scenario, ...injects, ...render, ...generate }

async function invoke<C extends Channel>(channel: C, req: ChannelRequest<C>) {
  return dispatch(handlers, channel, req)
}
async function ok<C extends Channel>(channel: C, req: ChannelRequest<C>) {
  const r = await invoke(channel, req)
  if (!r.ok) throw new Error(`${channel}: ${r.error.code} ${r.error.message}`)
  return r.data as never
}

describe('busy guard on write channels (#206)', () => {
  let projectPath: string
  let current: Scenario
  let inject: Inject
  let release: () => void

  beforeEach(async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-bg-'))
    projectPath = ((await ok('project:create', { parentDir, name: 'Busy' })) as { path: string })
      .path
    const empty: Scenario = await ok('scenarios:create-empty', { projectPath, title: 'Owned' })
    current = await ok('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: empty.id, projectId: empty.projectId, title: 'Owned' },
    })
    inject = await ok('injects:create', {
      projectPath,
      scenarioId: current.id,
      mselRowId: current.msel[0]!.id,
      type: 'memo',
    })
    release = claimScenario(projectPath, current.id, 'job-under-test')
    return () => release()
  })

  const writes = (): [Channel, unknown][] => {
    const ref = { projectPath, scenarioId: current.id }
    const one = { ...ref, injectId: inject.id }
    return [
      ['scenarios:save', { projectPath, scenario: { ...current, title: 'Edited' } }],
      ['scenarios:delete', ref],
      ['scenarios:doc-save', { ...ref, kind: 'handbook', markdown: '# Edited' }],
      ['scenarios:history-restore', { ...ref, artifact: 'scenario', entryId: 'entry1' }],
      ['injects:save', { ...ref, inject: { ...inject, title: 'Edited' } }],
      ['injects:create', { ...ref, mselRowId: current.msel[1]!.id, type: 'memo' }],
      ['injects:delete', one],
      ['injects:restore-version', { ...one, versionIndex: 0 }],
      ['injects:regenerate-text', one],
      ['injects:regenerate-media', one],
      ['library:insert', { ...ref, libraryId: 'lib1', mselRowId: 'I-03' }],
      ['render:inject', one],
      ['generate:continue', ref],
      ['generate:injects', ref],
      ['generate:media', ref],
      ['generate:repair', ref],
    ]
  }

  it('covers every listed write channel', () => {
    expect(writes().map(([c]) => c)).toEqual(WRITE_CHANNELS)
  })

  it.each(WRITE_CHANNELS)('%s answers CONFLICT', async (channel) => {
    const req = writes().find(([c]) => c === channel)![1]
    const r = await invoke(channel, req as never)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('CONFLICT')
  })

  it('leaves the scenario and inject unchanged', async () => {
    for (const [channel, req] of writes()) await invoke(channel, req as never)
    release()
    const ref = { projectPath, scenarioId: current.id }
    expect(((await ok('scenarios:get', ref)) as Scenario).title).toBe('Owned')
    const list = (await ok('injects:list', ref)) as Inject[]
    expect(list.map((i) => i.title)).toEqual([inject.title])
  })

  it('accepts the same write once the job releases the scenario', async () => {
    release()
    const saved = (await ok('scenarios:save', {
      projectPath,
      scenario: { ...current, title: 'Edited' },
    })) as Scenario
    expect(saved.title).toBe('Edited')
  })
})

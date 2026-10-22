import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import { Scenario } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { dispatch } = await import('../registry')
const { default: projectHandlers } = await import('./project')
const { default: scenarioHandlers } = await import('./scenario')
const { resetSettingsCache } = await import('../../settings/store')

const handlers = { ...projectHandlers, ...scenarioHandlers }
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

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
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-hg-'))
  projectPath = (await invoke('project:create', { parentDir, name: 'NCIA' })).path
})

describe('scenarios:history-get', () => {
  it('returns the markdown of an earlier document version', async () => {
    const s = await invoke('scenarios:create-empty', { projectPath, title: 'Flight to Nowhere' })
    const ref = { projectPath, scenarioId: s.id }
    await invoke('scenarios:doc-save', { ...ref, kind: 'handbook', markdown: '# Handbook v1' })
    await invoke('scenarios:doc-save', { ...ref, kind: 'handbook', markdown: '# Handbook v2' })
    const hist = await invoke('scenarios:history', { ...ref, artifact: 'handbook' })
    expect(hist).toHaveLength(2)
    const older = await invoke('scenarios:history-get', {
      ...ref,
      artifact: 'handbook',
      entryId: hist[1]!.id,
    })
    expect(older).toEqual({ markdown: '# Handbook v1' })
  })

  it('returns a schema-valid scenario for the scenario artifact', async () => {
    const s = await invoke('scenarios:create-empty', { projectPath, title: 'Flight to Nowhere' })
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: s.id, projectId: s.projectId },
      note: 'fixture',
    })
    const ref = { projectPath, scenarioId: s.id }
    const [entry] = await invoke('scenarios:history', { ...ref, artifact: 'scenario' })
    const got = await invoke('scenarios:history-get', {
      ...ref,
      artifact: 'scenario',
      entryId: entry!.id,
    })
    expect(got.markdown).toBeUndefined()
    expect(Scenario.safeParse(got.scenario).success).toBe(true)
    expect(got.scenario?.msel).toHaveLength(24)
  })

  it('NOT_FOUND for an unknown entry; unsafe ids are rejected', async () => {
    const s = await invoke('scenarios:create-empty', { projectPath, title: 'X' })
    const ref = { projectPath, scenarioId: s.id, artifact: 'briefing' as const }
    await expect(
      invoke('scenarios:history-get', { ...ref, entryId: 'NOPE' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      invoke('scenarios:history-get', { ...ref, entryId: '../escape' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import type { Scenario } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { dispatch } = await import('../ipc/registry')
const { default: projectHandlers } = await import('../ipc/handlers/project')
const { default: scenarioHandlers } = await import('../ipc/handlers/scenario')
const { resetSettingsCache } = await import('../settings/store')

const handlers = { ...projectHandlers, ...scenarioHandlers }
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '../../../tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Scenario

async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok)
    throw Object.assign(new Error(r.error.message), {
      code: r.error.code,
      details: r.error.details,
    })
  return r.data as ChannelResponse<C>
}

let projectPath: string
beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  const parentDir = mkdtempSync(join(tmpdir(), 'ttx-sh-'))
  projectPath = (await invoke('project:create', { parentDir, name: 'NCIA' })).path
})

const createEmpty = (title = 'Flight to Nowhere') =>
  invoke('scenarios:create-empty', { projectPath, title, brief: { durationHours: 3 } })

describe('scenarios:* handlers', () => {
  it('create-empty applies brief defaults; list and get return it', async () => {
    const s = await createEmpty()
    expect(s.brief).toMatchObject({ durationHours: 3, phaseCount: 4, audience: [] })
    expect(await invoke('scenarios:list', { projectPath })).toEqual([
      { id: s.id, title: s.title, status: 'draft', updatedAt: s.updatedAt },
    ])
    expect((await invoke('scenarios:get', { projectPath, scenarioId: s.id })).id).toBe(s.id)
  })

  it('save records a user history entry with the note', async () => {
    const s = await createEmpty()
    const saved = await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: s.id, projectId: s.projectId },
      note: 'imported Scenario 3',
    })
    expect(saved.msel).toHaveLength(24)
    const hist = await invoke('scenarios:history', {
      projectPath,
      scenarioId: s.id,
      artifact: 'scenario',
    })
    expect(hist).toEqual([
      { id: expect.any(String), at: expect.any(String), by: 'user', note: 'imported Scenario 3' },
    ])
  })

  it('save keeps inject files linked when MSEL row ids are renamed', async () => {
    const s = await createEmpty()
    const base = { ...FIXTURE, id: s.id, projectId: s.projectId }
    const { saveInject, listInjects } = await import('./store')
    const { Inject } = await import('@shared/schemas')
    const row = base.msel.find((r) => r.id === 'I-04')!
    const inject = await saveInject(
      projectPath,
      s.id,
      Inject.parse({
        id: '01INJECTTWEET0000000000000',
        mselRowId: 'I-04',
        type: 'tweet',
        title: 'Tweet',
        fields: {},
      }),
      { by: 'ai' },
    )
    const linked = {
      ...base,
      msel: base.msel.map((r) => (r === row ? { ...r, injectId: inject.id } : r)),
    }
    await invoke('scenarios:save', { projectPath, scenario: linked })
    // Renumber I-04 → I-05 in the editor and save again.
    const renamed = {
      ...linked,
      msel: linked.msel.map((r) => (r.injectId === inject.id ? { ...r, id: 'I-05' } : r)),
    }
    await invoke('scenarios:save', { projectPath, scenario: renamed, note: 'MSEL edit' })
    const after = (await listInjects(projectPath, s.id)).find((i) => i.id === inject.id)!
    expect(after.mselRowId).toBe('I-05')
  })

  it('doc-save / doc-get / history-restore for a document', async () => {
    const s = await createEmpty()
    const ref = { projectPath, scenarioId: s.id, kind: 'handbook' as const }
    await invoke('scenarios:doc-save', { ...ref, markdown: '# Handbook v1' })
    await invoke('scenarios:doc-save', { ...ref, markdown: '# Handbook v2' })
    expect(await invoke('scenarios:doc-get', ref)).toEqual({ markdown: '# Handbook v2' })
    const hist = await invoke('scenarios:history', {
      projectPath,
      scenarioId: s.id,
      artifact: 'handbook',
    })
    await invoke('scenarios:history-restore', {
      projectPath,
      scenarioId: s.id,
      artifact: 'handbook',
      entryId: hist[1]!.id,
    })
    expect(await invoke('scenarios:doc-get', ref)).toEqual({ markdown: '# Handbook v1' })
  })

  it('duplicate and delete', async () => {
    const s = await createEmpty()
    const copy = await invoke('scenarios:duplicate', { projectPath, scenarioId: s.id })
    expect(copy.title).toBe('Flight to Nowhere (copy)')
    const named = await invoke('scenarios:duplicate', {
      projectPath,
      scenarioId: s.id,
      title: 'Variant B',
    })
    expect(named.title).toBe('Variant B')
    await invoke('scenarios:delete', { projectPath, scenarioId: s.id })
    expect(existsSync(join(projectPath, 'scenarios', s.id))).toBe(false)
    const ids = (await invoke('scenarios:list', { projectPath })).map((m) => m.id).sort()
    expect(ids).toEqual([copy.id, named.id].sort())
  })

  it('lint returns stored warnings or fresh lint output', async () => {
    const s = await createEmpty()
    const warning = {
      code: 'X',
      severity: 'warning' as const,
      message: 'm',
      source: 'lint' as const,
    }
    await invoke('scenarios:save', { projectPath, scenario: { ...s, warnings: [warning] } })
    const out = await invoke('scenarios:lint', { projectPath, scenarioId: s.id })
    expect(Array.isArray(out)).toBe(true)
    for (const w of out) expect(w).toHaveProperty('severity')
  })

  it('save with a stale baseUpdatedAt answers CONFLICT and keeps the newer copy (#199)', async () => {
    const s = await createEmpty()
    // A later millisecond, so updatedAt differs.
    await new Promise((r) => setTimeout(r, 5))
    const first = await invoke('scenarios:save', {
      projectPath,
      scenario: { ...s, title: 'Renamed elsewhere' },
    })
    await expect(
      invoke('scenarios:save', {
        projectPath,
        scenario: { ...s, phases: [] },
        baseUpdatedAt: s.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'stale' } })
    const saved = await invoke('scenarios:save', {
      projectPath,
      scenario: { ...first, phases: [] },
      baseUpdatedAt: first.updatedAt,
    })
    expect(saved.title).toBe('Renamed elsewhere')
  })

  it('rejects unsafe scenario ids at the IPC boundary', async () => {
    for (const scenarioId of ['..', '../../etc', 'a/b'])
      await expect(invoke('scenarios:get', { projectPath, scenarioId })).rejects.toMatchObject({
        code: 'VALIDATION',
      })
  })

  it('requires an opened project', async () => {
    const stranger = mkdtempSync(join(tmpdir(), 'ttx-stranger-'))
    mkdirSync(join(stranger, 'scenarios'))
    writeFileSync(join(stranger, 'project.json'), '{}')
    await expect(invoke('scenarios:list', { projectPath: stranger })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(
      invoke('scenarios:create-empty', { projectPath: stranger, title: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

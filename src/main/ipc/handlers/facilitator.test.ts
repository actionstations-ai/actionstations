// Integration: facilitator channels through the IPC dispatcher against a real project folder.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as PresentModuleNs from '../../facilitator/present'

type PresentModule = typeof PresentModuleNs

const present = vi.fn()
const closePresent = vi.fn()

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  screen: {
    getAllDisplays: () => [{ id: 7, label: 'Projector', size: { width: 1920, height: 1080 } }],
    getPrimaryDisplay: () => ({ id: 7 }),
  },
}))
vi.mock('../../facilitator/present', async (orig) => ({
  ...(await orig<PresentModule>()),
  present,
  closePresent,
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./facilitator')).default
const { createProject } = await import('../../project/store')
const { createScenario, saveInject } = await import('../../scenario/store')
const { Inject, ScenarioBrief } = await import('@shared/schemas')

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-fac-'))
  const { path: projectPath } = await createProject({ parentDir: parent, name: 'NCIA' })
  const s = await createScenario(projectPath, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  const inject = Inject.parse({ id: 'INJ06', mselRowId: 'I-06', type: 'fids_board', title: 'FIDS' })
  await saveInject(projectPath, s.id, inject, { by: 'user' })
  return { projectPath, scenarioId: s.id }
}

describe('facilitator handlers', () => {
  beforeEach(() => {
    present.mockClear()
    closePresent.mockClear()
  })

  it('saves and reads the session state', async () => {
    const { projectPath, scenarioId } = await setup()
    const state = {
      elapsedMin: 15,
      delivered: { 'I-01': { at: '2026-10-21T14:00:00.000Z', exerciseTime: '0:15' } },
      notes: { 'I-01': 'Fast escalation' },
      generalNotes: '',
    }
    const saved = await dispatch(handlers, 'facilitator:state-save', {
      projectPath,
      scenarioId,
      state,
    })
    expect(saved).toMatchObject({ ok: true, data: state })
    const read = await dispatch(handlers, 'facilitator:state-get', { projectPath, scenarioId })
    expect(read).toMatchObject({ ok: true, data: state })
  })

  it('refuses unopened projects and invalid state', async () => {
    const { projectPath, scenarioId } = await setup()
    const other = mkdtempSync(join(tmpdir(), 'ttx-x-'))
    expect(
      await dispatch(handlers, 'facilitator:state-get', { projectPath: other, scenarioId }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(
      await dispatch(handlers, 'facilitator:state-save', {
        projectPath,
        scenarioId,
        state: { elapsedMin: -1 },
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(
      await dispatch(handlers, 'facilitator:state-get', { projectPath, scenarioId: '../..' }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('refuses to present a decision the scenario does not have', async () => {
    const { projectPath, scenarioId } = await setup()
    const res = await dispatch(handlers, 'facilitator:present-decision', {
      projectPath,
      scenarioId,
      decisionId: 'd9',
    })
    expect(res).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(present).not.toHaveBeenCalled()
  })

  it('presents an existing inject and refuses unknown ones', async () => {
    const { projectPath, scenarioId } = await setup()
    const ok = await dispatch(handlers, 'facilitator:present', {
      projectPath,
      scenarioId,
      injectId: 'INJ06',
      assetId: 'A1',
      displayId: 7,
    })
    expect(ok).toMatchObject({ ok: true })
    expect(present).toHaveBeenCalledWith(
      { projectPath, scenarioId, injectId: 'INJ06', assetId: 'A1' },
      { displayId: 7 },
    )
    const missing = await dispatch(handlers, 'facilitator:present', {
      projectPath,
      scenarioId,
      injectId: 'NOPE',
    })
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(present).toHaveBeenCalledTimes(1)
  })

  it('lists displays and closes the presentation', async () => {
    expect(await dispatch(handlers, 'facilitator:displays', undefined)).toEqual({
      ok: true,
      data: [{ id: 7, label: 'Projector', primary: true, width: 1920, height: 1080 }],
    })
    expect(await dispatch(handlers, 'facilitator:close-present', undefined)).toMatchObject({
      ok: true,
    })
    expect(closePresent).toHaveBeenCalled()
  })
})

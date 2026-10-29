// program:* through the IPC dispatcher (#424): the program guard, the CONFLICT payload and the
// path from creating a program to a proposal.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), on: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}))
vi.mock('../../render/window', () => ({ renderPdf: async () => Buffer.from('%PDF') }))

const { dispatch } = await import('../registry')
const handlers = (await import('./program')).default
const { createProject } = await import('../../project/store')
const { resetSettingsCache } = await import('../../settings/store')

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; details?: unknown } }
const call = <T>(channel: string, req: unknown) =>
  dispatch(handlers, channel, req) as Promise<Result<T>>
const ok = async <T>(channel: string, req: unknown): Promise<T> => {
  const r = await call<T>(channel, req)
  if (!r.ok) throw new Error(`${channel}: ${r.error.code}`)
  return r.data
}

let parent: string
let programPath: string

const manual = (title: string, extra: Record<string, unknown> = {}) => ({
  id: 'new-1',
  programId: 'x',
  title,
  source: { kind: 'manual' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

beforeEach(async () => {
  parent = mkdtempSync(join(tmpdir(), 'ttx-prog-ipc-'))
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  const created = await ok<{ path: string }>('program:create', {
    parentDir: parent,
    name: 'County Program',
    startYear: 2026,
  })
  programPath = created.path
})

describe('program channels', () => {
  it('refuses a folder the user never opened, even if it looks like a program', async () => {
    const stranger = join(mkdtempSync(join(tmpdir(), 'ttx-stranger-')), 'x.asprogram')
    mkdirSync(stranger)
    writeFileSync(join(stranger, 'program.json'), '{}')
    const r = await call('program:get', { programPath: stranger })
    expect(r).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(await call('program:actions-list', { programPath: stranger })).toMatchObject({
      ok: false,
    })
  })

  it('returns the other version in a CONFLICT so the editor can offer a choice', async () => {
    const created = await ok<{ action: { id: string }; revision: string }>('program:action-save', {
      programPath,
      action: manual('Original'),
    })
    await ok('program:action-save', {
      programPath,
      action: { ...created.action, title: 'Edited elsewhere' },
      baseRevision: created.revision,
    })
    const r = await call('program:action-save', {
      programPath,
      action: { ...created.action, title: 'Mine' },
      baseRevision: created.revision,
    })
    expect(r).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', details: { theirs: { action: { title: 'Edited elsewhere' } } } },
    })
  })

  it('changes status with the rules enforced and proposes from open actions', async () => {
    const a = await ok<{ action: { id: string } }>('program:action-save', {
      programPath,
      action: manual('Cut off vendor VPN', {
        coreCapabilities: ['cybersecurity'],
        dueDate: '2020-01-01',
      }),
    })
    const bad = await call('program:action-status', {
      programPath,
      ids: [a.action.id],
      to: 'verified',
    })
    expect(bad).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    const proposal = await ok<{ capabilities: { key: string }[]; correctiveActionIds: string[] }>(
      'program:propose',
      { programPath },
    )
    expect(proposal.capabilities[0]!.key).toBe('cybersecurity')
    expect(proposal.correctiveActionIds).toEqual([a.action.id])
  })

  it('links a project and reports whether it can be found', async () => {
    const { path } = await createProject({ parentDir: parent, name: 'Airport' })
    const open = await ok<{ reachable: Record<string, boolean>; program: { projects: unknown[] } }>(
      'program:link-project',
      { programPath, projectPath: path },
    )
    expect(open.program.projects).toHaveLength(1)
    expect(Object.values(open.reachable)).toEqual([true])
    const snapshots = await ok<unknown[]>('program:snapshots', { programPath })
    expect(snapshots).toHaveLength(1)
  })

  it('exports the improvement plan as CSV into the folder the user chose', async () => {
    await ok('program:action-save', { programPath, action: manual('Write the procedure') })
    const out = join(parent, 'exports-out')
    const { files } = await ok<{ files: string[] }>('program:export', {
      programPath,
      outDir: out,
      targets: ['ip_csv'],
    })
    expect(files).toHaveLength(1)
    expect(files[0]!.endsWith('improvement-plan.csv')).toBe(true)
  })
})

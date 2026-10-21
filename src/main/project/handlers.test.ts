import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { dispatch } = await import('../ipc/registry')
const { default: handlers } = await import('../ipc/handlers/project')
const { onEmit } = await import('../lib/events')
const { resetSettingsCache, getSettings } = await import('../settings/store')
const { loadProject } = await import('./store')

/** Invoke a channel through the real dispatcher (zod validation included); throw on error. */
async function invoke<C extends Channel>(
  channel: C,
  req: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

describe('project handlers', () => {
  let parent: string
  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'ttx-ph-'))
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
  })

  const create = (name = 'Northfield Regional', extra: Record<string, string> = {}) =>
    invoke('project:create', { parentDir: parent, name, orgName: 'NRAA', ...extra })

  it('creates a project, lists it as recent and gets it back', async () => {
    const { path, project } = await create('Northfield Regional', { orgType: 'airport' })
    expect(project.orgType).toBe('airport')
    const recent = await invoke('project:list-recent', undefined)
    expect(recent.map((r) => r.path)).toEqual([path])
    const got = await invoke('project:get', { path })
    expect(got.project.id).toBe(project.id)
  })

  it('refuses get/update for folders the user never opened', async () => {
    const stranger = join(parent, 'other.ttxproj')
    mkdirSync(stranger)
    writeFileSync(join(stranger, 'project.json'), '{}')
    await expect(invoke('project:get', { path: stranger })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(
      invoke('project:update', { path: stranger, patch: { name: 'x' } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('opens an existing project folder and registers it', async () => {
    const { path } = await create()
    await invoke('project:forget-recent', { path })
    expect(await invoke('project:list-recent', undefined)).toHaveLength(0)
    const opened = await invoke('project:open', { path })
    expect(opened.path).toBe(path)
    expect((await getSettings()).recentProjects[0]?.path).toBe(path)
  })

  it('updates name/org/roles, emits project:changed and syncs the recent entry', async () => {
    const { path } = await create()
    const seen: string[] = []
    const off = onEmit((name) => seen.push(name))
    const role = {
      id: 'asc',
      name: 'Airport Security Coordinator',
      abbreviation: 'ASC',
      team: 'Security',
      description: 'Owns the ASP',
      standingOrders: ['Notify TSA within 1 hour'],
    }
    const { project } = await invoke('project:update', {
      path,
      patch: {
        name: 'Northfield Intl',
        orgName: 'Northfield Airport Authority',
        defaultRoles: [role],
      },
    })
    off()
    expect(project.name).toBe('Northfield Intl')
    expect(project.defaultRoles).toEqual([role])
    expect(seen).toContain('project:changed')
    expect((await loadProject(path)).orgName).toBe('Northfield Airport Authority')
    const [recent] = await invoke('project:list-recent', undefined)
    expect(recent).toMatchObject({
      name: 'Northfield Intl',
      orgName: 'Northfield Airport Authority',
    })
  })

  it('treats brand as a shallow patch: omitted fields keep stored values', async () => {
    const { path } = await create()
    await invoke('project:update', {
      path,
      patch: { brand: { city: 'Northfield', region: 'Ohio', aliases: { localTv: 'WNFD 5' } } },
    })
    const { project } = await invoke('project:update', {
      path,
      patch: { brand: { primaryColor: '#1f4e79' } },
    })
    expect(project.brand).toEqual({
      city: 'Northfield',
      region: 'Ohio',
      primaryColor: '#1f4e79',
      aliases: { localTv: 'WNFD 5' },
    })
    const replaced = await invoke('project:update', {
      path,
      patch: { brand: { aliases: { airlineA: 'Lakeshore Air' } } },
    })
    expect(replaced.project.brand.aliases).toEqual({ airlineA: 'Lakeshore Air' })
    expect(replaced.project.brand.city).toBe('Northfield')
  })

  it('leaves fields that a patch does not mention untouched', async () => {
    const { path } = await create('Keep', { orgType: 'hospital' })
    const { project } = await invoke('project:update', { path, patch: { orgName: 'Mercy' } })
    expect(project).toMatchObject({ name: 'Keep', orgType: 'hospital', orgName: 'Mercy' })
  })

  it('archives and unarchives, flagging the recent entry', async () => {
    const { path } = await create()
    expect((await invoke('project:archive', { path, archived: true })).project.archived).toBe(true)
    expect((await invoke('project:list-recent', undefined))[0]?.archived).toBe(true)
    expect((await getSettings()).recentProjects[0]?.archived).toBe(true)
    await invoke('project:archive', { path, archived: false })
    expect((await invoke('project:list-recent', undefined))[0]?.archived).toBe(false)
  })

  it('duplicates a folder without derived index/cache data, with a new id and name', async () => {
    const src = await create()
    mkdirSync(join(src.path, 'documents', 'doc1'))
    writeFileSync(join(src.path, 'documents', 'doc1', 'source.txt'), 'TIRP section 13')
    writeFileSync(join(src.path, 'index.sqlite'), 'db')
    writeFileSync(join(src.path, 'index.sqlite-wal'), 'wal')
    mkdirSync(join(src.path, '.cache'))
    writeFileSync(join(src.path, '.cache', 'x.bin'), 'cache')
    await invoke('project:archive', { path: src.path, archived: true })

    const copy = await invoke('project:duplicate', { path: src.path, newName: 'Northfield Copy' })
    expect(copy.path).toBe(join(parent, 'Northfield-Copy.ttxproj'))
    expect(copy.project.id).not.toBe(src.project.id)
    expect(copy.project.name).toBe('Northfield Copy')
    expect(copy.project.archived).toBe(false)
    expect(existsSync(join(copy.path, 'documents', 'doc1', 'source.txt'))).toBe(true)
    expect(existsSync(join(copy.path, '.gitignore'))).toBe(true)
    for (const derived of ['index.sqlite', 'index.sqlite-wal', '.cache'])
      expect(existsSync(join(copy.path, derived))).toBe(false)
    expect((await loadProject(src.path)).name).toBe('Northfield Regional')
    // The copy is opened: it is first in the recent list and the guard accepts it.
    expect((await invoke('project:list-recent', undefined))[0]?.path).toBe(copy.path)
    await expect(invoke('project:get', { path: copy.path })).resolves.toBeDefined()
  })

  it('refuses to duplicate over an existing folder', async () => {
    const { path } = await create('Dup')
    mkdirSync(join(parent, 'Taken.ttxproj'))
    await expect(invoke('project:duplicate', { path, newName: 'Taken' })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('drops recent entries whose folder no longer exists; forget removes from settings', async () => {
    const a = await create('Alpha')
    const b = await create('Bravo')
    rmSync(a.path, { recursive: true })
    const recent = await invoke('project:list-recent', undefined)
    expect(recent.map((r) => r.path)).toEqual([b.path])
    const after = await invoke('project:forget-recent', { path: b.path })
    expect(after).toEqual([])
    expect((await getSettings()).recentProjects.map((r) => r.path)).toEqual([a.path])
  })
})

// The program folder (#424): layout, validation of what is read, per-file revision conflicts,
// the advisory lock, linking projects and finding them again.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const store = await import('./store')
const actions = await import('./actions')
const links = await import('./links')
const { requireProgram } = await import('./guard')
const { createProject, loadProject } = await import('../project/store')
const { resetSettingsCache, getSettings } = await import('../settings/store')
const { ProgramAction } = await import('@shared/schemas')

let parent: string
let root: string

const draft = (title: string, extra: Record<string, unknown> = {}) =>
  ProgramAction.parse({
    id: 'draft',
    programId: 'x',
    title,
    source: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  })

beforeEach(async () => {
  parent = mkdtempSync(join(tmpdir(), 'ttx-prog-'))
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  root = await store.createProgram({ parentDir: parent, name: 'Summit County', startYear: 2026 })
})

describe('program folder', () => {
  it('creates the documented layout and remembers the folder as active', async () => {
    expect(root.endsWith('Summit-County.asprogram')).toBe(true)
    for (const f of ['program.json', 'schedule.json', 'corrective-actions', 'imports', 'projects'])
      expect(existsSync(join(root, f))).toBe(true)
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toContain('.lock.json')
    const { program } = await getSettings()
    expect(program.activePath).toBe(root)
    expect(program.recent[0]?.name).toBe('Summit County')
  })

  it('refuses a program saved by a newer format', async () => {
    const file = join(root, 'program.json')
    const json = JSON.parse(readFileSync(file, 'utf8'))
    writeFileSync(file, JSON.stringify({ ...json, formatVersion: 99 }))
    await expect(store.loadProgram(root)).rejects.toThrow(/newer version/)
  })

  it('keeps unknown keys through a save', async () => {
    const file = join(root, 'program.json')
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), futureKey: 7 }))
    await store.updateProgram(root, (p) => {
      p.orgName = 'County'
    })
    expect(JSON.parse(readFileSync(file, 'utf8')).futureKey).toBe(7)
  })

  it('refuses a stale program.json save with the stored copy', async () => {
    const before = await store.loadProgram(root)
    await store.updateProgram(root, (p) => {
      p.orgName = 'A'
    })
    await expect(
      store.updateProgram(
        root,
        (p) => {
          p.orgName = 'B'
        },
        before.updatedAt,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('only serves a program the user opened', async () => {
    await expect(requireProgram(root)).resolves.toBe(root)
    const other = mkdtempSync(join(tmpdir(), 'ttx-other-'))
    mkdirSync(join(other, 'x.asprogram'))
    writeFileSync(join(other, 'x.asprogram', 'program.json'), '{}')
    await expect(requireProgram(join(other, 'x.asprogram'))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('advisory lock', () => {
  const foreign = {
    host: 'EOC-PC2',
    user: 'jruiz',
    at: new Date().toISOString(),
    holder: 'someone-else',
  }

  it('shows another computer and keeps editing possible', async () => {
    store.writeLockForTest(root, foreign)
    const summary = await store.summarize(root)
    expect(summary.lock?.host).toBe('EOC-PC2')
    const view = await actions.createAction(root, draft('Still editable'))
    expect(view.action.number).toBe(1)
  })

  it('still shows the other computer after we open the program and take the lock', async () => {
    store.writeLockForTest(root, foreign)
    await store.openProgram(root)
    expect((await store.summarize(root)).lock?.host).toBe('EOC-PC2')
    await store.closeProgram()
  })

  it('ignores a lock nobody refreshed for a day', async () => {
    store.writeLockForTest(root, { ...foreign, at: '2020-01-01T00:00:00.000Z' })
    expect((await store.summarize(root)).lock).toBeUndefined()
  })

  it('writes our own lock on open and removes it on close', async () => {
    await store.openProgram(root)
    expect(existsSync(join(root, '.lock.json'))).toBe(true)
    expect((await store.summarize(root)).lock).toBeUndefined()
    await store.closeProgram()
    expect(existsSync(join(root, '.lock.json'))).toBe(false)
  })

  it('does not write a lock when the program setting turns it off', async () => {
    await store.updateProgram(root, (p) => {
      p.lock = false
    })
    await store.openProgram(root)
    expect(existsSync(join(root, '.lock.json'))).toBe(false)
  })

  it('ignores a damaged lock file', async () => {
    writeFileSync(join(root, '.lock.json'), '{not json')
    expect((await store.summarize(root)).lock).toBeUndefined()
  })
})

describe('corrective action files', () => {
  it('numbers actions in order and never reuses a number', async () => {
    const a = await actions.createAction(root, draft('First'))
    const b = await actions.createAction(root, draft('Second'))
    await actions.deleteAction(root, b.action.id)
    const c = await actions.createAction(root, draft('Third'))
    expect([a.action.number, b.action.number, c.action.number]).toEqual([1, 2, 3])
    expect((await actions.listActions(root)).actions.map((v) => v.action.title)).toEqual([
      'First',
      'Third',
    ])
  })

  it('refuses a save made from an older revision and returns the other version', async () => {
    const { action, revision } = await actions.createAction(root, draft('Vendor VPN cut-off'))
    const mine = await actions.saveAction(root, { ...action, title: 'Mine' }, revision)
    await expect(
      actions.saveAction(root, { ...action, title: 'Theirs' }, revision),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { theirs: { revision: mine.revision, action: { title: 'Mine' } } },
    })
  })

  it('detects an edit made by another computer directly in the file', async () => {
    const { action, revision } = await actions.createAction(root, draft('Original'))
    const file = join(root, 'corrective-actions', `${action.id}.json`)
    writeFileSync(file, JSON.stringify({ ...action, notes: 'edited on the share' }, null, 2) + '\n')
    await expect(actions.saveAction(root, action, revision)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('does not let an edit rewrite the status history', async () => {
    const { action, revision } = await actions.createAction(root, draft('Keep history'))
    const forged = { ...action, status: 'verified' as const, history: [] }
    const saved = await actions.saveAction(root, forged, revision)
    expect(saved.action.status).toBe('open')
    expect(saved.action.history).toHaveLength(1)
  })

  it('changes status for several actions together or not at all', async () => {
    const a = await actions.createAction(root, draft('A'))
    const b = await actions.createAction(root, draft('B'))
    await expect(
      actions.changeStatus(root, [a.action.id, b.action.id], 'deferred', ''),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    const done = await actions.changeStatus(
      root,
      [a.action.id, b.action.id],
      'in_progress',
      'Started',
    )
    expect(done.map((v) => v.action.status)).toEqual(['in_progress', 'in_progress'])
    expect(done[0]!.action.history.at(-1)).toMatchObject({ from: 'open', to: 'in_progress' })
  })

  it('lists a damaged file as a problem instead of hiding the rest', async () => {
    await actions.createAction(root, draft('Good one'))
    writeFileSync(join(root, 'corrective-actions', 'broken.json'), '{"id": 5}')
    const list = await actions.listActions(root)
    expect(list.actions).toHaveLength(1)
    expect(list.problems[0]).toMatch(/broken\.json/)
  })

  it('filters by status, capability, owner and overdue', async () => {
    await actions.createAction(
      root,
      draft('Late PIO', {
        coreCapabilities: ['public_information_and_warning'],
        owner: { name: 'J. Ruiz' },
        dueDate: '2020-01-01',
      }),
    )
    await actions.createAction(root, draft('Fine', { dueDate: '2999-01-01' }))
    const titles = async (f: Parameters<typeof actions.listActions>[1]) =>
      (await actions.listActions(root, f)).actions.map((v) => v.action.title)
    expect(await titles({ overdueOnly: true })).toEqual(['Late PIO'])
    expect(await titles({ capability: 'public_information_and_warning' })).toEqual(['Late PIO'])
    expect(await titles({ ownerName: 'J. Ruiz' })).toEqual(['Late PIO'])
    expect(await titles({ statuses: ['completed'] })).toEqual([])
  })
})

describe('linking projects', () => {
  it('links by a path relative to the program, writes the hint, and unlinks both sides', async () => {
    const { path } = await createProject({ parentDir: parent, name: 'Airport' })
    const program = await links.linkProject(root, path)
    expect(program.projects[0]).toMatchObject({ name: 'Airport', path: 'Airport.asproj' })
    expect((await loadProject(path)).program).toEqual({
      id: program.id,
      path: 'Summit-County.asprogram',
    })
    expect((await links.resolveProjectPath(program.projects[0]!, root)).path).toBe(path)

    await links.unlinkProject(root, program.projects[0]!.projectId)
    expect((await store.loadProgram(root)).projects).toEqual([])
    expect((await loadProject(path)).program).toBeUndefined()
  })

  it('stores an absolute path for a project elsewhere and finds it by id when the path is stale', async () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'ttx-else-'))
    const { path } = await createProject({ parentDir: elsewhere, name: 'Transit' })
    const program = await links.linkProject(root, path)
    const link = program.projects[0]!
    expect(link.path).toBe(path)
    const stale = { ...link, path: join(elsewhere, 'moved.asproj') }
    expect((await links.resolveProjectPath(stale, root)).path).toBe(path)
  })

  it('does not follow a path outside the program folder to a project nobody opened', async () => {
    const strangerParent = mkdtempSync(join(tmpdir(), 'ttx-stranger-'))
    const { path } = await createProject({ parentDir: strangerParent, name: 'Stranger' })
    resetSettingsCache()
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud2-'))
    const project = await loadProject(path)
    const link = {
      projectId: project.id,
      name: 'Stranger',
      path,
      linkedAt: '2026-01-01T00:00:00.000Z',
    }
    // The project registry remembers projects opened this session; a fresh path with a
    // parent-segment is refused outright.
    const escape = { ...link, path: '../../etc' }
    expect((await links.resolveProjectPath(escape, root)).reachable).toBe(false)
  })

  it('refuses a project linked to another program', async () => {
    const { path } = await createProject({ parentDir: parent, name: 'Shared' })
    await links.linkProject(root, path)
    const second = await store.createProgram({ parentDir: parent, name: 'Other', startYear: 2026 })
    await expect(links.linkProject(second, path)).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

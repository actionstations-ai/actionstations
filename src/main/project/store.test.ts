import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject, folderLabel, loadProject, openProject, updateProject, projectPaths } =
  await import('./store')
const { duplicateProject } = await import('./duplicate')
const { getSettings, resetSettingsCache } = await import('../settings/store')

describe('project store', () => {
  let parent: string
  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'ttx-proj-'))
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
  })

  it('creates the documented folder layout and records it as recent', async () => {
    const { path, project } = await createProject({
      parentDir: parent,
      name: 'North Coast International',
      orgName: 'NCRAA',
      orgType: 'airport',
    })
    expect(path.endsWith('North-Coast-International.asproj')).toBe(true)
    for (const d of ['documents', 'scenarios', 'prompts'])
      expect(existsSync(join(path, d))).toBe(true)
    expect(readFileSync(join(path, '.gitignore'), 'utf8')).toContain('index.sqlite')
    expect(readFileSync(join(path, '.gitignore'), 'utf8')).toContain('exports/')
    expect((await loadProject(path)).id).toBe(project.id)
    expect((await getSettings()).recentProjects[0]?.path).toBe(path)
  })

  it('opens and duplicates a project from before the rename (.ttxproj, #277)', async () => {
    const { path } = await createProject({ parentDir: parent, name: 'Legacy' })
    const legacy = join(parent, 'Legacy.ttxproj')
    renameSync(path, legacy)
    const opened = await openProject(legacy)
    expect(opened.path).toBe(legacy)
    expect((await getSettings()).recentProjects[0]?.path).toBe(legacy)
    const copy = await duplicateProject(legacy, { newName: 'Legacy copy' })
    expect(copy.path).toBe(join(parent, 'Legacy-copy.asproj'))
  })

  it('labels both project folder extensions without the extension', () => {
    expect(folderLabel('/x/North-Coast.asproj')).toBe('North-Coast')
    expect(folderLabel('/x/North-Coast.ttxproj')).toBe('North-Coast')
    expect(folderLabel('/x/plain-folder')).toBe('plain-folder')
  })

  it('refuses to overwrite an existing folder', async () => {
    await createProject({ parentDir: parent, name: 'Dup' })
    await expect(createProject({ parentDir: parent, name: 'Dup' })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('serializes concurrent updates without losing writes', async () => {
    const { path } = await createProject({ parentDir: parent, name: 'Race' })
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        updateProject(path, (p) => {
          p.defaultRoles.push({
            id: `r${i}`,
            name: `Role ${i}`,
            abbreviation: '',
            team: '',
            description: '',
            standingOrders: [],
          })
        }),
      ),
    )
    expect((await loadProject(path)).defaultRoles).toHaveLength(10)
  })

  it('rejects folders that are not projects', async () => {
    await expect(openProject(parent)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('guards derived paths', async () => {
    const { path } = await createProject({ parentDir: parent, name: 'Guard' })
    expect(() => projectPaths(path).document('../../etc')).toThrow(/escapes/)
  })
})

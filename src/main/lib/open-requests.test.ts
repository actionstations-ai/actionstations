// Project folders the OS asks the app to open (#277): queued until the renderer listens.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted(() => [] as unknown[])
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [
      { isDestroyed: () => false, webContents: { send: (...a: unknown[]) => sent.push(a) } },
    ],
  },
}))

const {
  isPackFilePath,
  isProjectFolderPath,
  openPathsFromArgv,
  projectPathsFromArgv,
  requestOpen,
  resetOpenRequests,
  takePendingOpens,
  takePendingPackOpens,
} = await import('./open-requests')

describe('open requests', () => {
  beforeEach(() => {
    resetOpenRequests()
    sent.length = 0
  })

  it('recognizes both project folder extensions', () => {
    expect(isProjectFolderPath('/Users/a/Documents/Action Stations/Dam.asproj')).toBe(true)
    expect(isProjectFolderPath('C:\\Users\\a\\Dam.TTXPROJ\\')).toBe(true)
    expect(isProjectFolderPath('/Users/a/Dam.asproj/project.json')).toBe(false)
    expect(isProjectFolderPath('/Users/a/notes.txt')).toBe(false)
  })

  it('picks project folders out of a command line', () => {
    const argv = ['--inspect=0', 'out/main/index.js', '/p/A.asproj', '/p/B.ttxproj']
    expect(projectPathsFromArgv(argv)).toEqual(['/p/A.asproj', '/p/B.ttxproj'])
  })

  it('queues requests until the renderer takes them, then forwards new ones', () => {
    requestOpen('/p/A.asproj')
    expect(sent).toEqual([])
    expect(takePendingOpens()).toEqual(['/p/A.asproj'])
    expect(takePendingOpens()).toEqual([])
    requestOpen('/p/B.asproj')
    expect(sent).toEqual([['event:app:open-project', { path: '/p/B.asproj' }]])
  })

  it('recognizes pack archives', () => {
    expect(isPackFilePath('/Users/a/Downloads/org.example.rail-1.0.0.aspack')).toBe(true)
    expect(isPackFilePath('C:\\Users\\a\\RAIL.ASPACK')).toBe(true)
    expect(isPackFilePath('/Users/a/rail.aspack.zip')).toBe(false)
  })

  it('picks project folders and packs out of a command line, in order', () => {
    const argv = ['out/main/index.js', '/d/rail.aspack', '--flag', '/p/A.asproj', '/x/notes.md']
    expect(openPathsFromArgv(argv)).toEqual(['/d/rail.aspack', '/p/A.asproj'])
  })

  it('queues packs apart from projects and forwards them as app:open-pack', () => {
    requestOpen('/d/rail.aspack')
    requestOpen('/p/A.asproj')
    expect(takePendingOpens()).toEqual(['/p/A.asproj'])
    requestOpen('/d/second.aspack')
    expect(sent).toEqual([])
    expect(takePendingPackOpens()).toEqual(['/d/rail.aspack', '/d/second.aspack'])
    requestOpen('/d/third.aspack')
    expect(sent).toEqual([['event:app:open-pack', { path: '/d/third.aspack' }]])
  })
})

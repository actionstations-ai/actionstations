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
  isProjectFolderPath,
  projectPathsFromArgv,
  requestOpen,
  resetOpenRequests,
  takePendingOpens,
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
})

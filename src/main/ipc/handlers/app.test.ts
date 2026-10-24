// app:pending-pack-opens (#268): .aspack files the OS handed the app before the renderer
// listened, through the IPC dispatcher. Taking them never installs anything.
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getName: () => 'Action Stations', getVersion: () => '0.1.0', isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
  dialog: {},
  shell: {},
  ipcMain: { handle: vi.fn() },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./app')).default
const { requestOpen, resetOpenRequests } = await import('../../lib/open-requests')

describe('app:pending-pack-opens', () => {
  it('returns queued packs once, and leaves project folders to app:pending-opens', async () => {
    resetOpenRequests()
    requestOpen('/Users/a/Downloads/rail.aspack')
    requestOpen('/Users/a/Dam.asproj')
    expect(await dispatch(handlers, 'app:pending-pack-opens', undefined)).toEqual({
      ok: true,
      data: ['/Users/a/Downloads/rail.aspack'],
    })
    expect(await dispatch(handlers, 'app:pending-pack-opens', undefined)).toEqual({
      ok: true,
      data: [],
    })
    expect(await dispatch(handlers, 'app:pending-opens', undefined)).toEqual({
      ok: true,
      data: ['/Users/a/Dam.asproj'],
    })
  })
})

// app:pending-pack-opens (#268): .aspack files the OS handed the app before the renderer
// listened, through the IPC dispatcher. Taking them never installs anything.
import { describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  app: { getName: () => 'Action Stations', getVersion: () => '0.1.0', isPackaged: false },
  shell: { openExternal: vi.fn(async (_url: string) => undefined) },
}))

vi.mock('electron', () => ({
  app: electron.app,
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
  dialog: {},
  shell: electron.shell,
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

describe('help:open-guide (#443)', () => {
  const GUIDE = 'docs/guides/getting-started.md#repair-a-scenario'

  it("opens the tip's guide section on main in an unpackaged build", async () => {
    electron.shell.openExternal.mockClear()
    electron.app.isPackaged = false
    expect(await dispatch(handlers, 'help:open-guide', { tipId: 'repair-scenario' })).toEqual({
      ok: true,
    })
    expect(electron.shell.openExternal).toHaveBeenCalledWith(
      `https://github.com/actionstations-ai/actionstations/blob/main/${GUIDE}`,
    )
  })

  it("opens the guide at the app's own release tag in a packaged build", async () => {
    electron.shell.openExternal.mockClear()
    electron.app.isPackaged = true
    try {
      await dispatch(handlers, 'help:open-guide', { tipId: 'repair-scenario' })
    } finally {
      electron.app.isPackaged = false
    }
    expect(electron.shell.openExternal).toHaveBeenCalledWith(
      `https://github.com/actionstations-ai/actionstations/blob/v0.1.0/${GUIDE}`,
    )
  })

  it('refuses an unknown tip id and opens nothing', async () => {
    electron.shell.openExternal.mockClear()
    const r = await dispatch(handlers, 'help:open-guide', { tipId: 'https://evil.test' })
    expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(electron.shell.openExternal).not.toHaveBeenCalled()
  })
})

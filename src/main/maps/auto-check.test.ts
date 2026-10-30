// The map catalog check that rides on the update check (#500): off unless both switches are on,
// at most once a day, and it records the ids that have a newer file.
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppSettings } from '@shared/schemas/settings'

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0', getPath: () => tmpdir(), isPackaged: false },
}))

let settings = AppSettings.parse({})
vi.mock('../settings/store', () => ({
  getSettings: async () => settings,
  updateSettings: async (fn: (s: AppSettings) => void) => {
    fn(settings)
    return settings
  },
}))
const fetchCatalog = vi.fn(async () => ({ entries: [] }))
const updatesFor = vi.fn(async () => [{ id: 'us-oh' }])
vi.mock('./catalog', () => ({
  fetchCatalog: (...a: unknown[]) => fetchCatalog(...(a as [])),
  updatesFor: (...a: unknown[]) => updatesFor(...(a as [])),
}))

const { autoCheckDeps, checkMapCatalogAtStartup } = await import('./auto-check')

const DAY = 24 * 60 * 60 * 1000
const on = (): AppSettings => {
  const s = AppSettings.parse({})
  s.updates.check = 'on'
  s.maps.checkUpdates = true
  return s
}

beforeEach(() => {
  settings = on()
  fetchCatalog.mockClear()
  autoCheckDeps.now = () => Date.parse('2026-10-29T12:00:00Z')
})

describe('checkMapCatalogAtStartup', () => {
  it('asks for nothing while the version check is not on', async () => {
    settings.updates.check = 'ask'
    expect(await checkMapCatalogAtStartup()).toBeUndefined()
    expect(fetchCatalog).not.toHaveBeenCalled()
  })

  it('asks for nothing while the map switch is off', async () => {
    settings.maps.checkUpdates = false
    expect(await checkMapCatalogAtStartup()).toBeUndefined()
    expect(fetchCatalog).not.toHaveBeenCalled()
  })

  it('checks the catalog and records which files have a newer version', async () => {
    expect(await checkMapCatalogAtStartup()).toEqual(['us-oh'])
    expect(settings.maps.lastCatalogCheck).toEqual({
      at: '2026-10-29T12:00:00.000Z',
      updates: ['us-oh'],
    })
  })

  it('checks at most once a day', async () => {
    await checkMapCatalogAtStartup()
    autoCheckDeps.now = () => Date.parse('2026-10-29T12:00:00Z') + DAY - 1
    expect(await checkMapCatalogAtStartup()).toBeUndefined()
    autoCheckDeps.now = () => Date.parse('2026-10-29T12:00:00Z') + DAY
    expect(await checkMapCatalogAtStartup()).toEqual(['us-oh'])
    expect(fetchCatalog).toHaveBeenCalledTimes(2)
  })
})

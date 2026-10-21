import { beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getSettings, resetSettingsCache, updateSettings } from './store'

describe('settings store', () => {
  beforeEach(() => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-set-'))
    resetSettingsCache()
  })

  it('keeps every write when updates race on a cold cache', async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        updateSettings((s) => {
          s.recentProjects.push({
            path: `/p${i}`,
            name: `P${i}`,
            orgName: '',
            openedAt: new Date().toISOString(),
            archived: false,
          })
        }),
      ),
    )
    resetSettingsCache()
    expect((await getSettings()).recentProjects).toHaveLength(8)
  })

  it('does not hand out the cached object', async () => {
    const a = await getSettings()
    a.ui.theme = 'dark'
    expect((await getSettings()).ui.theme).toBe('system')
  })

  it('keeps working after a failed update', async () => {
    await expect(
      updateSettings(() => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    await updateSettings((s) => {
      s.ui.theme = 'light'
    })
    expect((await getSettings()).ui.theme).toBe('light')
  })
})

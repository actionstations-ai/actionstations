// updates:* through the IPC dispatcher (#442), with a fake fetch: never a real request.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { UpdateStatus } from '@shared/ipc'

const electron = vi.hoisted(() => ({
  app: { getVersion: () => '0.5.1', isPackaged: false, getPath: () => '/tmp', on: () => undefined },
  shell: { openExternal: vi.fn(async (_url: string) => undefined) },
}))
vi.mock('electron', () => ({
  app: electron.app,
  shell: electron.shell,
  BrowserWindow: { getAllWindows: () => [] },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./updates')).default
const { DAY_MS, resetUpdateCheck, scheduleStartupCheck, updateDeps } =
  await import('../../updates/check')
const { getSettings, resetSettingsCache, updateSettings } = await import('../../settings/store')
const { onEmit } = await import('../../lib/events')
const { fakeFetch, githubRelease, jsonResponse } = await import('../../updates/test-release')

async function call<T = UpdateStatus>(channel: string, req?: unknown): Promise<T> {
  const res = await dispatch(handlers, channel, req)
  if (!res.ok) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

const NOW = Date.parse('2026-11-02T12:00:00Z')
let net: ReturnType<typeof fakeFetch>
let version: string
let platform: NodeJS.Platform

beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-updates-'))
  resetSettingsCache()
  resetUpdateCheck()
  version = '0.5.1'
  platform = 'darwin'
  net = fakeFetch(() => jsonResponse(githubRelease()))
  updateDeps.appVersion = () => version
  updateDeps.platform = () => platform
  updateDeps.now = () => NOW
  updateDeps.fetchImpl = net.impl
  updateDeps.url = () =>
    'https://api.github.com/repos/actionstations-ai/actionstations/releases/latest'
  electron.shell.openExternal.mockClear()
})

describe('the setting', () => {
  it('starts as "ask" and sends nothing at startup', async () => {
    const s = await call('updates:status')
    expect(s).toMatchObject({ mode: 'ask', installed: '0.5.1', newer: false, checking: false })
    await scheduleStartupCheck()
    expect(net.calls).toHaveLength(0)
  })

  it('sends nothing at startup when off', async () => {
    await call('updates:set', { check: 'off' })
    await scheduleStartupCheck()
    expect(net.calls).toHaveLength(0)
  })

  it('becomes "off" after the question was shown on three launches without an answer', async () => {
    for (let i = 0; i < 5; i++) await call('updates:set', { asked: true })
    expect((await call('updates:status')).askedCount).toBe(3)
    await scheduleStartupCheck()
    expect((await getSettings()).updates.check).toBe('off')
    expect(net.calls).toHaveLength(0)
  })

  it('refuses a URL or unknown fields in updates:set', async () => {
    await expect(call('updates:set', { url: 'https://evil.test' })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })
})

describe('the startup check', () => {
  it('checks once with the setting on, then not again within a day', async () => {
    await call('updates:set', { check: 'on' })
    await scheduleStartupCheck()
    expect(net.calls).toHaveLength(1)
    updateDeps.now = () => NOW + DAY_MS - 1
    await scheduleStartupCheck()
    expect(net.calls).toHaveLength(1)
    updateDeps.now = () => NOW + DAY_MS
    await scheduleStartupCheck()
    expect(net.calls).toHaveLength(2)
  })

  it('records a failure and does not retry until a day later', async () => {
    net = fakeFetch(() => new Response('', { status: 502 }))
    updateDeps.fetchImpl = net.impl
    await call('updates:set', { check: 'on' })
    await scheduleStartupCheck()
    await scheduleStartupCheck()
    expect(net.calls).toHaveLength(1)
    expect((await call('updates:status')).lastResult).toEqual({
      kind: 'error',
      message: 'GitHub answered HTTP 502',
    })
  })
})

describe('Check now', () => {
  it('runs whatever the setting, and reports a newer release with its installer', async () => {
    const s = await call('updates:check')
    expect(net.calls).toHaveLength(1)
    expect(s).toMatchObject({
      mode: 'ask',
      newer: true,
      dismissed: false,
      lastCheckedAt: '2026-11-02T12:00:00.000Z',
      platformAsset: {
        name: 'actionstations-0.6.0-mac-arm64.dmg',
        checksum: 'actionstations-0.6.0-mac-arm64.dmg.sha256',
      },
      notes: [],
    })
  })

  it('names the uninstall step for Windows users of 0.5.0', async () => {
    version = '0.5.0'
    platform = 'win32'
    const s = await call('updates:check')
    expect(s.notes).toEqual([expect.stringMatching(/Uninstall Action Stations 0\.5\.0/)])
    expect(s.platformAsset?.name).toBe('actionstations-0.6.0-win-x64-setup.exe')
  })

  it('says when the installed version is the latest or ahead of it', async () => {
    version = '0.6.0'
    expect(await call('updates:check')).toMatchObject({ newer: false, ahead: false })
    resetSettingsCache()
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-updates-'))
    version = '0.7.0-dev.1'
    expect(await call('updates:check')).toMatchObject({ newer: false, ahead: true })
  })

  it('shares one request between two presses and waits a minute before the next', async () => {
    const [a, b] = await Promise.all([call('updates:check'), call('updates:check')])
    expect(a).toEqual(b)
    expect(net.calls).toHaveLength(1)
    updateDeps.now = () => NOW + 30_000
    await call('updates:check')
    expect(net.calls).toHaveLength(1)
    updateDeps.now = () => NOW + 61_000
    await call('updates:check')
    expect(net.calls).toHaveLength(2)
  })

  it('tells the renderer when a check starts and ends', async () => {
    const seen: string[] = []
    const off = onEmit((name) => seen.push(name))
    await call('updates:check')
    off()
    expect(seen.filter((n) => n === 'updates:changed').length).toBeGreaterThanOrEqual(2)
  })

  it('turning the setting off stops a check in flight and records nothing', async () => {
    const hang = (async (_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      )) as typeof fetch
    updateDeps.fetchImpl = hang
    const pending = call('updates:check')
    await new Promise((r) => setTimeout(r, 10))
    await call('updates:set', { check: 'off' })
    const s = await pending
    expect(s.lastResult).toBeUndefined()
    expect(s.mode).toBe('off')
  })
})

describe('Not now and opening pages', () => {
  it('"Not now" hides this version only', async () => {
    await call('updates:check')
    expect((await call('updates:set', { dismissedVersion: '0.6.0' })).dismissed).toBe(true)
    await updateSettings((s) => {
      if (s.updates.lastResult?.kind === 'ok') s.updates.lastResult.latest.version = '0.6.1'
    })
    expect((await call('updates:status')).dismissed).toBe(false)
  })

  it('opens the stored release page, and nothing before a check', async () => {
    await expect(call('updates:open', { target: 'release' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await call('updates:check')
    await call('updates:open', { target: 'release' })
    expect(electron.shell.openExternal).toHaveBeenLastCalledWith(
      'https://github.com/actionstations-ai/actionstations/releases/tag/v0.6.0',
    )
  })

  it('re-checks the stored page before opening it', async () => {
    await call('updates:check')
    await updateSettings((s) => {
      if (s.updates.lastResult?.kind === 'ok')
        s.updates.lastResult.latest.url = 'https://evil.test/'
    })
    await expect(call('updates:open', { target: 'release' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(electron.shell.openExternal).not.toHaveBeenCalled()
  })

  it('opens the Updates guide section at main in an unpackaged build', async () => {
    await call('updates:open', { target: 'guide' })
    expect(electron.shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/actionstations-ai/actionstations/blob/main/docs/guides/getting-started.md#updates',
    )
  })
})

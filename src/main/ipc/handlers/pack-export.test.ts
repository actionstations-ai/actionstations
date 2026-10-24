// packs:export* through the IPC dispatcher (#271): sources for an open project, the review
// check, saving through main's save dialog (written only after the reader accepts the pack,
// nothing written when refused or canceled), and the contribution page opened on request.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import { PACK_CONTRIBUTION_URL } from '@shared/ipc/pack-export'

const showSaveDialog = vi.fn()
const openExternal = vi.fn(async () => undefined)
vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.1.0',
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => tmpdir(),
  },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
  dialog: { showSaveDialog },
  shell: { openExternal },
  ipcMain: { handle: vi.fn() },
}))
process.env.TTX_RESOURCES = resolve('.')
process.env.TTX_APP_VERSION = '0.3.0'

const { dispatch } = await import('../registry')
const handlers = (await import('./pack-export')).default
const { createProject } = await import('../../project/store')
const { resetSettingsCache } = await import('../../settings/store')
const { registerPackProfiles } = await import('@shared/domains')
const { loadPacks } = await import('../../packs')

async function call<C extends Channel>(
  channel: C,
  ...req: ChannelRequest<C> extends void ? [] : [ChannelRequest<C>]
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req[0])
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

let userData: string
let root: string

const request = (confirmed = true) => ({
  metadata: {
    id: 'io.github.tester.prompt-kit',
    name: 'Prompt kit',
    version: '0.1.0',
    summary: 'One prompt override.',
    author: { name: 'Tester' },
    license: 'MIT',
  },
  prompts: ['inject_text'],
  redistributeConfirmed: confirmed,
})

beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'ttx-pe-ud-'))
  process.env.TTX_USER_DATA = userData
  resetSettingsCache()
  registerPackProfiles([])
  await loadPacks()
  mkdirSync(join(userData, 'prompts'), { recursive: true })
  writeFileSync(
    join(userData, 'prompts', 'inject_text.md'),
    readFileSync(resolve('prompts/inject_text.md')),
  )
  root = (await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-pe-p-')), name: 'Kit' }))
    .path
  showSaveDialog.mockReset()
  openExternal.mockClear()
})

describe('pack export handlers', () => {
  it('lists sources for an open project with the app version', async () => {
    const s = await call('packs:exportSources', { projectPath: root })
    expect(s.prompts).toEqual([{ id: 'inject_text', label: 'inject_text' }])
    expect(s.project?.name).toBe('Kit')
    expect(s.appVersion).toBe('0.3.0')
  })

  it('checks a pack for the review step', async () => {
    const r = await call('packs:exportCheck', request())
    expect(r).toMatchObject({ ok: true, fileName: 'io.github.tester.prompt-kit-0.1.0.aspack' })
  })

  it('saves where the user chose, with the reported sha256', async () => {
    const target = join(mkdtempSync(join(tmpdir(), 'ttx-pe-out-')), 'kit.aspack')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })
    const r = await call('packs:exportSave', request())
    if (!r.ok || r.canceled) throw new Error('not saved')
    expect(r.path).toBe(target)
    const bytes = readFileSync(target)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(r.sha256)
    expect(showSaveDialog.mock.calls[0]![0]).toMatchObject({
      defaultPath: expect.stringMatching(/io\.github\.tester\.prompt-kit-0\.1\.0\.aspack$/),
    })
  })

  it('writes nothing when the user cancels', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true })
    expect(await call('packs:exportSave', request())).toEqual({ ok: true, canceled: true })
  })

  it('refuses before asking where to save when the pack is not valid', async () => {
    const r = await call('packs:exportSave', request(false))
    expect(r.ok).toBe(false)
    expect(showSaveDialog).not.toHaveBeenCalled()
  })

  it('refuses a project that is not open', async () => {
    const other = join(tmpdir(), 'not-a-project')
    await expect(call('packs:exportSources', { projectPath: other })).rejects.toThrow()
    expect(existsSync(other)).toBe(false)
  })

  it('opens the contribution page only when called', async () => {
    expect(openExternal).not.toHaveBeenCalled()
    await call('packs:openContribution')
    expect(openExternal).toHaveBeenCalledWith(PACK_CONTRIBUTION_URL)
  })
})

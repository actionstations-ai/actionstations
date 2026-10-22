// Integration: comfy:* channels through the IPC dispatcher against a fake ComfyUI server.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startFakeComfy, type FakeComfy } from '../../providers/media/comfyui/fake-server'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./comfy')).default
const { updateSettings, resetSettingsCache } = await import('../../settings/store')
const { resetResolveState } = await import('../../providers/resolve')
const { resetStoreState } = await import('../../comfy/store')

async function call<T = unknown>(channel: string, req?: unknown): Promise<T> {
  const res = await dispatch(handlers, channel, req)
  if (!res.ok) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

let fake: FakeComfy

beforeEach(async () => {
  process.env.TTX_RESOURCES = process.cwd()
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-comfy-ipc-'))
  resetSettingsCache()
  resetResolveState()
  resetStoreState()
  fake = await startFakeComfy()
  await updateSettings((s) => {
    s.providers.push({
      id: 'comfy',
      kind: 'comfyui',
      label: 'ComfyUI',
      baseUrl: fake.url,
      options: {},
      enabled: true,
    })
    s.providers.push({ id: 'mock', kind: 'mock', label: 'Mock', options: {}, enabled: true })
  })
})

afterEach(async () => fake.close())

describe('comfy:* handlers', () => {
  it('comfy:status reports connection and missing nodes per workflow', async () => {
    const status = await call<{
      ok: boolean
      message: string
      workflows: { id: string; missingNodes: string[] }[]
    }>('comfy:status', { providerId: 'comfy' })
    expect(status.ok).toBe(true)
    expect(status.message).toContain('ComfyUI 0.42.0')
    expect(status.workflows.find((w) => w.id === 'sdxl-photo')!.missingNodes).toEqual([])
    expect(status.workflows.find((w) => w.id === 'image-to-video')!.missingNodes).toContain(
      'LTXVImgToVideo',
    )
    const list = await call<{ id: string; missingNodes?: string[] }[]>('comfy:workflows:list', {})
    expect(list.find((w) => w.id === 'image-to-video')!.missingNodes!.length).toBeGreaterThan(0)
  })

  it('comfy:status refuses non-ComfyUI providers', async () => {
    await expect(call('comfy:status', { providerId: 'mock' })).rejects.toThrow(/not a ComfyUI/)
  })

  it('imports, lists inputs, saves bindings, sets the default and deletes', async () => {
    const src = join(mkdtempSync(join(tmpdir(), 'ttx-wf-')), 'flux.json')
    writeFileSync(
      src,
      JSON.stringify({
        '1': { class_type: 'CLIPTextEncode', inputs: { text: 'x', clip: ['2', 0] } },
        '2': { class_type: 'SaveImage', inputs: { filename_prefix: 'y' } },
      }),
    )
    const entry = await call<{ id: string }>('comfy:workflows:import', {
      filePath: src,
      name: 'Flux photo',
      mediaType: 'image',
    })
    expect(entry.id).toBe('flux-photo')
    const inputs = await call<{ inputName: string }[]>('comfy:workflows:inputs', {
      id: 'flux-photo',
    })
    expect(inputs.map((i) => i.inputName)).toEqual(['text', 'filename_prefix'])
    const saved = await call<{ bindings: unknown[] }>('comfy:workflows:save-bindings', {
      id: 'flux-photo',
      bindings: [{ target: ['1', 'inputs', 'text'], source: 'imagePrompt' }],
    })
    expect(saved.bindings).toHaveLength(1)
    expect(await call('comfy:defaults:set', { image: 'flux-photo' })).toMatchObject({
      image: 'flux-photo',
      video: 'image-to-video',
    })
    await call('comfy:workflows:delete', { id: 'flux-photo' })
    expect(await call('comfy:defaults:get')).toMatchObject({ image: 'sdxl-photo' })
  })

  it('comfy:test-render returns an inline preview for an image workflow', async () => {
    const out = await call<{ mimeType: string; dataUrl: string; seed: number }>(
      'comfy:test-render',
      { providerId: 'comfy', workflowId: 'sdxl-photo', prompt: 'a hangar' },
    )
    expect(out.mimeType).toBe('image/png')
    expect(out.dataUrl.startsWith('data:image/png;base64,iVBOR')).toBe(true)
    expect(Number.isInteger(out.seed)).toBe(true)
    expect(fake.prompts[0]!.prompt['6']!.inputs.text).toBe('a hangar')
  })

  it('comfy:test-render of a video workflow needs a prior image test', async () => {
    await expect(
      call('comfy:test-render', { providerId: 'comfy', workflowId: 'image-to-video' }),
    ).rejects.toThrow(/test render of an image workflow first/)
  })

  it('guards projectPath', async () => {
    await expect(
      call('comfy:workflows:list', { projectPath: '/not/opened' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

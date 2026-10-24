// Integration: comfy:* channels through the IPC dispatcher against a fake ComfyUI server.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPack, validPackTree, type PackTree } from '../../../../tests/fixtures/packs/build'
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
const { resetStoreState, workflowForRender } = await import('../../comfy/store')
const { createProject } = await import('../../project/store')
const packs = await import('../../packs')

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
  await packs.loadPacks()
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

  it('lists, rebinds and selects a pack workflow (read-only, override in userData)', async () => {
    const archive = join(mkdtempSync(join(tmpdir(), 'ttx-wf-pack-')), 'rail.aspack')
    writeFileSync(archive, await buildPack())
    await packs.installPack(
      { path: archive, source: { kind: 'file', name: 'rail.aspack' } },
      { appVersion: '0.3.0' },
    )
    const status = await call<{ workflows: { id: string; missingNodes: string[] }[] }>(
      'comfy:status',
      { providerId: 'comfy' },
    )
    expect(status.workflows.find((w) => w.id === 'yard-cctv-still')!.missingNodes).toEqual([
      'UltimateSDUpscale',
    ])
    const list = await call<Record<string, unknown>[]>('comfy:workflows:list', {})
    expect(list.find((w) => w.id === 'yard-cctv-still')).toMatchObject({
      source: 'pack',
      packId: 'ai.actionstations.heritage-rail',
      packVersion: '1.0.0',
      packName: 'Freight Rail Operations',
      customNodes: ['UltimateSDUpscale'],
    })
    const saved = await call<{ source: string; bindings: unknown[] }>(
      'comfy:workflows:save-bindings',
      { id: 'yard-cctv-still', bindings: [] },
    )
    expect(saved).toMatchObject({ source: 'pack', bindings: [] })
    expect(await call('comfy:defaults:set', { image: 'yard-cctv-still' })).toMatchObject({
      image: 'yard-cctv-still',
    })
    await call('comfy:workflows:delete', { id: 'yard-cctv-still' }) // resets the override
    await expect(call('comfy:workflows:delete', { id: 'yard-cctv-still' })).rejects.toThrow(
      /uninstall the pack/,
    )
  })

  describe('comfy:workflows:updateFromPack (#310)', () => {
    const WF = 'yard-cctv-still'
    let root: string

    async function installRail(version: string, tree: PackTree = validPackTree()): Promise<void> {
      const archive = join(mkdtempSync(join(tmpdir(), 'ttx-wf-pack-')), `rail-${version}.aspack`)
      writeFileSync(archive, await buildPack(tree, { manifest: (m) => void (m.version = version) }))
      await packs.installPack(
        { path: archive, source: { kind: 'file', name: 'rail.aspack' } },
        { appVersion: '0.3.0' },
      )
    }

    /** Version 1.1.0 renames the workflow in its sidecar, so the update is visible. */
    function treeV2(): PackTree {
      const tree = validPackTree()
      const key = `workflows/${WF}.bindings.json`
      const sidecar = JSON.parse(String(tree[key])) as Record<string, unknown>
      tree[key] = JSON.stringify({ ...sidecar, name: 'Yard CCTV still v2' })
      return tree
    }

    const sidecarFile = () => join(root, 'comfy', 'workflows', `${WF}.bindings.json`)
    const listed = async () =>
      (await call<Record<string, unknown>[]>('comfy:workflows:list', { projectPath: root })).find(
        (w) => w.id === WF,
      )

    beforeEach(async () => {
      root = (await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-p-')), name: 'P' }))
        .path
      await installRail('1.0.0')
      await workflowForRender(WF, root) // copy-on-use
      await installRail('1.1.0', treeV2())
    })

    it('replaces an unedited copy with the installed version', async () => {
      expect(await listed()).toMatchObject({
        source: 'project',
        name: 'Yard CCTV still',
        packVersion: '1.0.0',
        copy: { edited: false, updateAvailable: true, installedVersion: '1.1.0' },
      })
      const updated = await call('comfy:workflows:updateFromPack', { id: WF, projectPath: root })
      expect(updated).toMatchObject({
        source: 'project',
        name: 'Yard CCTV still v2',
        packVersion: '1.1.0',
        copy: { edited: false, updateAvailable: false },
      })
      expect(await listed()).toMatchObject({ name: 'Yard CCTV still v2', packVersion: '1.1.0' })
    })

    it('refuses an edited copy without confirmation and replaces it with confirmation', async () => {
      await call('comfy:workflows:save-bindings', { id: WF, projectPath: root, bindings: [] })
      expect(await listed()).toMatchObject({ copy: { edited: true, updateAvailable: true } })
      await expect(
        call('comfy:workflows:updateFromPack', { id: WF, projectPath: root }),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(JSON.parse(readFileSync(sidecarFile(), 'utf8'))).toMatchObject({ bindings: [] })

      const updated = await call('comfy:workflows:updateFromPack', {
        id: WF,
        projectPath: root,
        confirmEdited: true,
      })
      expect(updated).toMatchObject({
        name: 'Yard CCTV still v2',
        packVersion: '1.1.0',
        copy: { edited: false, updateAvailable: false },
      })
      expect(
        (JSON.parse(readFileSync(sidecarFile(), 'utf8')) as { bindings: unknown[] }).bindings
          .length,
      ).toBeGreaterThan(0)
    })

    it('needs a recorded copy, the pack installed and an opened project', async () => {
      await expect(
        call('comfy:workflows:updateFromPack', { id: 'sdxl-photo', projectPath: root }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await packs.uninstallPack('ai.actionstations.heritage-rail')
      await expect(
        call('comfy:workflows:updateFromPack', { id: WF, projectPath: root }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(
        call('comfy:workflows:updateFromPack', { id: WF, projectPath: '/not/opened' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })
})

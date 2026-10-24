// Workflow store with packs (#264): precedence project > global > pack > default, read-only
// pack workflows with binding overrides, defaults, copy-on-use when media renders for a
// project, and the project still rendering after the pack is uninstalled (fake ComfyUI).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { buildPack, validPackTree, type PackTree } from '../../../tests/fixtures/packs/build'
import { startFakeComfy, type FakeComfy } from '../providers/media/comfyui/fake-server'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.1.0',
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => tmpdir(),
  },
  BrowserWindow: { getAllWindows: () => [] },
}))

const store = await import('./store')
const packs = await import('../packs')
const { readProjectPacks } = await import('../packs/project-copies')
const { ComfyMediaProvider } = await import('../providers/media/comfyui/provider')

const RAIL = 'ai.actionstations.heritage-rail'
const WF = 'yard-cctv-still'
const CTX = { appVersion: '0.3.0' }

let work: string
let fake: FakeComfy | undefined

beforeEach(async () => {
  process.env.TTX_RESOURCES = resolve('.')
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-comfy-packs-'))
  work = mkdtempSync(join(tmpdir(), 'ttx-comfy-packs-work-'))
  store.resetStoreState()
  await packs.loadPacks()
})

afterEach(async () => {
  await fake?.close()
  fake = undefined
})

async function install(tree?: PackTree, workflows?: string[]): Promise<void> {
  const path = join(work, `pack-${Date.now()}.aspack`)
  writeFileSync(
    path,
    await buildPack(tree, {
      manifest: (m) => {
        if (workflows) (m.contents as Record<string, string[]>).workflows = workflows
      },
    }),
  )
  await packs.installPack({ path, source: { kind: 'file', name: 'rail.aspack' } }, CTX)
}

function newProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'ttx-comfy-packs-proj-'))
  writeFileSync(join(root, 'project.json'), '{}')
  return root
}

/** Write a workflow + sidecar pair into a layer folder (global or project). */
function writeLayer(dir: string, id: string, name: string): void {
  mkdirSync(dir, { recursive: true })
  const tree = validPackTree()
  writeFileSync(join(dir, `${id}.json`), tree[`workflows/${WF}.json`]!)
  const sidecar = JSON.parse(String(tree[`workflows/${WF}.bindings.json`])) as object
  writeFileSync(join(dir, `${id}.bindings.json`), JSON.stringify({ ...sidecar, name }))
}

const userData = (...p: string[]): string => join(process.env.TTX_USER_DATA!, ...p)

describe('workflow store with packs', () => {
  it('lists pack workflows with their pack, custom nodes and missing nodes', async () => {
    await install()
    const entry = (await store.listWorkflows()).find((w) => w.id === WF)!
    expect(entry).toMatchObject({
      source: 'pack',
      name: 'Yard CCTV still',
      packId: RAIL,
      packVersion: '1.0.0',
      packName: 'Freight Rail Operations',
      customNodes: ['UltimateSDUpscale'],
    })
    expect(entry.missingNodes).toBeUndefined()
    store.setAvailableNodes(['KSampler', 'SaveImage'])
    const checked = (await store.loadWorkflow(WF)).entry
    expect(checked.missingNodes).toContain('UltimateSDUpscale')
    expect(checked.missingNodes).not.toContain('KSampler')
  })

  it('looks workflows up project > global > pack > default', async () => {
    // The pack provides sdxl-photo too: it shadows the shipped default of the same id.
    const tree = validPackTree()
    tree['workflows/sdxl-photo.json'] = tree[`workflows/${WF}.json`]!
    tree['workflows/sdxl-photo.bindings.json'] = JSON.stringify({
      ...(JSON.parse(String(tree[`workflows/${WF}.bindings.json`])) as object),
      name: 'Pack photo',
    })
    await install(tree, [WF, 'sdxl-photo'])
    expect((await store.loadWorkflow('sdxl-photo')).entry).toMatchObject({
      source: 'pack',
      name: 'Pack photo',
    })
    expect((await store.loadWorkflow('image-to-video')).entry.source).toBe('default')

    writeLayer(userData('comfy', 'workflows'), WF, 'Global yard')
    expect((await store.loadWorkflow(WF)).entry).toMatchObject({ source: 'global' })

    const root = newProject()
    writeLayer(join(root, 'comfy', 'workflows'), WF, 'Project yard')
    expect((await store.loadWorkflow(WF, root)).entry).toMatchObject({
      source: 'project',
      name: 'Project yard',
    })
    const listed = (await store.listWorkflows(root)).filter((w) => w.id === WF)
    expect(listed).toHaveLength(1)
    expect(listed[0]!.source).toBe('project')

    await packs.setPackEnabled(RAIL, false)
    expect((await store.loadWorkflow('sdxl-photo')).entry.source).toBe('default')
  })

  it('keeps pack workflows read-only: bindings go to an override that delete resets', async () => {
    await install()
    const packed = (await store.loadWorkflow(WF)).entry
    const before = readFileSync(join(packs.packById(RAIL)!.dir, 'workflows', `${WF}.bindings.json`))
    const bindings = [
      { target: ['3', 'inputs', 'seed'] as ['3', 'inputs', string], source: 'seed' as const },
    ]
    const saved = await store.saveBindings({ id: WF, bindings })
    expect(saved).toMatchObject({ source: 'pack', packId: RAIL, bindings })
    const override = userData('comfy', 'overrides', 'packs', RAIL, `${WF}.bindings.json`)
    expect(existsSync(override)).toBe(true)
    expect(
      readFileSync(join(packs.packById(RAIL)!.dir, 'workflows', `${WF}.bindings.json`)),
    ).toEqual(before)
    expect((await store.loadWorkflow(WF)).sidecar.bindings).toEqual(bindings)

    await store.deleteWorkflow(WF)
    expect((await store.loadWorkflow(WF)).entry.bindings).toEqual(packed.bindings)
    await expect(store.deleteWorkflow(WF)).rejects.toThrow(/uninstall the pack/)
  })

  it('never changes defaults.json on install; a pack workflow can be chosen as a default', async () => {
    await install()
    expect(existsSync(userData('comfy', 'defaults.json'))).toBe(false)
    expect(await store.getDefaults()).toEqual({ image: 'sdxl-photo', video: 'image-to-video' })
    expect(await store.setDefaults({ image: WF })).toMatchObject({ image: WF })
    await expect(store.setDefaults({ video: WF })).rejects.toThrow(/is a image workflow/)
  })

  it('imports never take an id an enabled pack uses', async () => {
    await install()
    const file = join(work, 'yard.json')
    writeFileSync(file, String(validPackTree()[`workflows/${WF}.json`]))
    const entry = await store.importWorkflow({ filePath: file, name: WF, mediaType: 'image' })
    expect(entry.id).toBe(`${WF}-2`)
  })

  it('copies a pack workflow into the project on use and records it in packs.json', async () => {
    await install()
    const bindings = [
      { target: ['3', 'inputs', 'seed'] as ['3', 'inputs', string], source: 'seed' as const },
    ]
    await store.saveBindings({ id: WF, bindings })
    const root = newProject()
    expect((await store.loadWorkflow(WF, root)).entry.source).toBe('pack') // listing never copies
    expect(existsSync(join(root, 'packs.json'))).toBe(false)

    const loaded = await store.workflowForRender(WF, root)
    expect(loaded.entry).toMatchObject({
      source: 'project',
      packId: RAIL,
      packVersion: '1.0.0',
      packName: 'Freight Rail Operations',
      copy: {
        edited: false,
        packMissing: false,
        updateAvailable: false,
        installedVersion: '1.0.0',
      },
    })
    expect(loaded.sidecar.bindings).toEqual(bindings) // the bindings in effect were copied
    const { copies } = await readProjectPacks(root)
    expect(copies).toEqual([
      expect.objectContaining({
        kind: 'workflows',
        id: WF,
        packId: RAIL,
        version: '1.0.0',
        files: [
          expect.objectContaining({ path: `comfy/workflows/${WF}.json` }),
          expect.objectContaining({ path: `comfy/workflows/${WF}.bindings.json` }),
        ],
      }),
    ])
    // A project without a pack workflow is left alone.
    const other = newProject()
    expect((await store.workflowForRender('sdxl-photo', other)).entry.source).toBe('default')
    expect(existsSync(join(other, 'packs.json'))).toBe(false)

    // Editing the copy's bindings marks it edited; deleting it forgets the record.
    await store.saveBindings({ id: WF, bindings: [], projectRoot: root })
    expect((await store.loadWorkflow(WF, root)).entry.copy?.edited).toBe(true)
    await store.deleteWorkflow(WF, root)
    expect((await readProjectPacks(root)).copies).toEqual([])
    expect((await store.loadWorkflow(WF, root)).entry.source).toBe('pack')
  })

  it('renders through the copy and keeps rendering after the pack is uninstalled', async () => {
    await install()
    await store.setDefaults({ image: WF })
    fake = await startFakeComfy()
    const config: ProviderConfig = {
      id: 'comfy-test',
      kind: 'comfyui',
      label: 'ComfyUI',
      baseUrl: fake.url,
      options: {},
      enabled: true,
    }
    const provider = new ComfyMediaProvider(config)
    const root = newProject()
    const job = () => ({
      kind: 'image' as const,
      injectId: 'I-01',
      outDir: join(root, 'scenarios', 's1', 'media', 'I-01'),
      seed: 7,
      brief: { paths: ['ai_image' as const], imagePrompt: 'rail yard at night' },
    })

    const [first] = await provider.generate(job())
    expect(first!.mimeType).toBe('image/png')
    expect(fake.prompts[0]!.prompt['99']!.class_type).toBe('UltimateSDUpscale')
    expect(existsSync(join(root, 'comfy', 'workflows', `${WF}.json`))).toBe(true)

    await packs.uninstallPack(RAIL)
    await expect(store.loadWorkflow(WF)).rejects.toThrow(/not found/)
    const entry = (await store.listWorkflows(root)).find((w) => w.id === WF)!
    expect(entry).toMatchObject({
      source: 'project',
      packId: RAIL,
      copy: { packMissing: true, edited: false, updateAvailable: false },
    })

    const [second] = await provider.generate(job())
    expect(second!.mimeType).toBe('image/png')
    expect(fake.prompts).toHaveLength(2)
    expect(fake.prompts[1]!.prompt['6']!.inputs.text).toMatch(/^rail yard at night/)
  })
})

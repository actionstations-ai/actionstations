import { mkdtempSync, promises as fs, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), isPackaged: false } }))

const store = await import('./store')

const SIMPLE = {
  '1': { class_type: 'SaveImage', inputs: { filename_prefix: 'x', images: ['2', 0] } },
}

function workflowFile(content: unknown = SIMPLE): string {
  const dir = mkdtempSync(join(tmpdir(), 'ttx-wf-src-'))
  const p = join(dir, 'My Workflow.json')
  writeFileSync(p, JSON.stringify(content))
  return p
}

async function newProject(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'ttx-proj-'))
  writeFileSync(join(root, 'project.json'), '{}')
  return root
}

beforeEach(() => {
  process.env.TTX_RESOURCES = process.cwd()
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-comfy-store-'))
  store.resetStoreState()
})

describe('workflow store', () => {
  it('lists the shipped defaults', async () => {
    const list = await store.listWorkflows()
    const ids = list.map((w) => `${w.source}:${w.mediaType}:${w.id}`)
    expect(ids).toEqual(
      expect.arrayContaining(['default:image:sdxl-photo', 'default:video:image-to-video']),
    )
    expect(list.every((w) => w.missingNodes === undefined)).toBe(true) // unknown until status runs
    store.setAvailableNodes(['SaveImage'])
    const photo = (await store.listWorkflows()).find((w) => w.id === 'sdxl-photo')!
    expect(photo.missingNodes).toContain('KSampler')
  })

  it('imports a global workflow with a unique id and an empty binding sidecar', async () => {
    const a = await store.importWorkflow({
      filePath: workflowFile(),
      name: 'My Workflow',
      mediaType: 'image',
    })
    const b = await store.importWorkflow({
      filePath: workflowFile(),
      name: 'My Workflow',
      mediaType: 'image',
    })
    expect([a.id, b.id]).toEqual(['my-workflow', 'my-workflow-2'])
    expect(a).toMatchObject({ source: 'global', bindings: [], requiredNodes: ['SaveImage'] })
    expect(await store.workflowInputs('my-workflow')).toEqual([
      { nodeId: '1', classType: 'SaveImage', inputName: 'filename_prefix', value: 'x' },
    ])
  })

  it('refuses UI-format files and non-JSON names', async () => {
    await expect(
      store.importWorkflow({
        filePath: workflowFile({ nodes: [], links: [] }),
        name: 'x',
        mediaType: 'image',
      }),
    ).rejects.toThrow(/Export \(API\)/)
    const txt = join(mkdtempSync(join(tmpdir(), 'ttx-wf-')), 'w.txt')
    writeFileSync(txt, '{}')
    await expect(
      store.importWorkflow({ filePath: txt, name: 'x', mediaType: 'image' }),
    ).rejects.toThrow(/\.json/)
  })

  it('project workflows shadow global ones of the same id', async () => {
    const root = await newProject()
    await store.importWorkflow({ filePath: workflowFile(), name: 'Shared', mediaType: 'image' })
    await store.importWorkflow({
      filePath: workflowFile(),
      name: 'Shared',
      mediaType: 'video',
      projectRoot: root,
    })
    expect((await store.loadWorkflow('shared', root)).entry).toMatchObject({
      source: 'project',
      mediaType: 'video',
    })
    expect((await store.loadWorkflow('shared')).entry.source).toBe('global')
    const listed = (await store.listWorkflows(root)).filter((w) => w.id === 'shared')
    expect(listed).toHaveLength(1)
    expect(await fs.readdir(join(root, 'comfy', 'workflows'))).toEqual([
      'shared.bindings.json',
      'shared.json',
    ])
  })

  it('saves bindings; for a default they go to an override that delete resets', async () => {
    const bindings = [
      {
        target: ['3', 'inputs', 'steps'] as ['3', 'inputs', string],
        source: 'literal' as const,
        value: 30,
      },
    ]
    const saved = await store.saveBindings({ id: 'sdxl-photo', bindings })
    expect(saved.bindings).toEqual(bindings)
    expect((await store.loadWorkflow('sdxl-photo')).sidecar.bindings).toEqual(bindings)
    await store.deleteWorkflow('sdxl-photo')
    expect((await store.loadWorkflow('sdxl-photo')).sidecar.bindings.length).toBeGreaterThan(1)
    await expect(store.deleteWorkflow('sdxl-photo')).rejects.toThrow(/cannot be deleted/)
  })

  it('validates binding targets', async () => {
    await expect(
      store.saveBindings({
        id: 'sdxl-photo',
        bindings: [{ target: ['999', 'inputs', 'x'], source: 'seed' }],
      }),
    ).rejects.toThrow(/unknown node/)
    await expect(
      store.saveBindings({
        id: 'sdxl-photo',
        bindings: [{ target: ['3', 'inputs', 'nope'], source: 'seed' }],
      }),
    ).rejects.toThrow(/no input "nope"/)
  })

  it('keeps per-media defaults, checks media types and forgets deleted workflows', async () => {
    expect(await store.getDefaults()).toEqual({ image: 'sdxl-photo', video: 'image-to-video' })
    const mine = await store.importWorkflow({
      filePath: workflowFile(),
      name: 'Mine',
      mediaType: 'image',
    })
    expect(await store.setDefaults({ image: mine.id })).toMatchObject({ image: 'mine' })
    await expect(store.setDefaults({ video: mine.id })).rejects.toThrow(/is a image workflow/)
    await store.deleteWorkflow(mine.id)
    expect((await store.getDefaults()).image).toBe('sdxl-photo')
  })

  it('finds the project folder above a media output dir', async () => {
    const root = await newProject()
    expect(await store.projectRootFor(join(root, 'scenarios', 's', 'media', 'I-1'))).toBe(root)
    expect(await store.projectRootFor(mkdtempSync(join(tmpdir(), 'ttx-none-')))).toBeUndefined()
  })

  it('rejects unsafe ids', async () => {
    await expect(store.loadWorkflow('../etc')).rejects.toThrow(/Invalid workflow id/)
  })
})

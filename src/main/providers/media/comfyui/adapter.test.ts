// Contract tests for the ComfyUI adapter against an in-process fake ComfyUI (HTTP + WS).
import { mkdtempSync, promises as fs, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { startFakeComfy, tinyPng, type FakeComfy, type FakeComfyOptions } from './fake-server'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir(), isPackaged: false } }))

beforeAll(() => {
  process.env.TTX_RESOURCES = process.cwd()
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-comfy-test-'))
})

const { createMediaProvider } = await import('../../registry')
const { ComfyMediaProvider } = await import('./provider')
const { workflowSha256 } = await import('../../../comfy/workflow')
const { listWorkflows, resetStoreState } = await import('../../../comfy/store')

let fake: FakeComfy | undefined

afterEach(async () => {
  await fake?.close()
  fake = undefined
  resetStoreState()
})

async function setup(opts: FakeComfyOptions = {}, options: Record<string, unknown> = {}) {
  fake = await startFakeComfy(opts)
  const config: ProviderConfig = {
    id: 'comfy-test',
    kind: 'comfyui',
    label: 'ComfyUI',
    baseUrl: fake.url,
    options,
    enabled: true,
  }
  return { fake, provider: createMediaProvider(config) }
}

const outDir = (): string => mkdtempSync(join(tmpdir(), 'ttx-comfy-out-'))

const imageJob = (extra: Record<string, unknown> = {}) => ({
  kind: 'image' as const,
  injectId: 'I-07',
  outDir: outDir(),
  brief: {
    paths: ['ai_image' as const],
    imagePrompt: 'baggage claim hall with a crowd of travelers',
    imageStyle: 'cctv' as const,
  },
  ...extra,
})

describe('ComfyUI adapter', () => {
  it('is discovered by the registry as a media provider', async () => {
    const { provider } = await setup()
    expect(provider).toBeInstanceOf(ComfyMediaProvider)
    expect([...provider.capabilities()]).toEqual(['image', 'video', 'audio'])
  })

  it('binds the brief into the workflow, follows WS progress and downloads outputs', async () => {
    const { fake, provider } = await setup()
    const progress: number[] = []
    const [out, ...rest] = await provider.generate(imageJob({ seed: 1234 }), (p) =>
      progress.push(p.progress),
    )
    expect(rest).toHaveLength(0) // the 'temp' preview is skipped
    const sent = fake.prompts[0]!.prompt
    expect(sent['6']!.inputs.text).toMatch(
      /^baggage claim hall with a crowd of travelers, security camera/,
    )
    expect(sent['7']!.inputs.text).toMatch(/^illustration, painting/)
    expect(sent['3']!.inputs.seed).toBe(1234)
    expect(sent['5']!.inputs.width).toBe(1216) // width not in job → workflow literal kept
    expect(out!.mimeType).toBe('image/png')
    expect(out!.width).toBe(64)
    expect(out!.height).toBe(48)
    expect(out!.filePath.startsWith(join(outDir(), '..'))).toBe(true)
    expect((await fs.stat(out!.filePath)).size).toBeGreaterThan(0)
    expect(out!.provenance).toMatchObject({
      provider: 'comfy-test',
      model: 'sd_xl_base_1.0.safetensors',
      seed: 1234,
      workflowHash: workflowSha256(sent as never),
    })
    expect(progress).toContain(0.5) // 0.1 + 0.8 · 1/2 from a WS progress event
    expect(progress.at(-1)).toBe(1)
  })

  it('picks a random seed when none is given and records it', async () => {
    const { fake, provider } = await setup()
    const [out] = await provider.generate(imageJob({ width: 832, height: 1216 }))
    const sent = fake.prompts[0]!.prompt
    expect(Number.isInteger(sent['3']!.inputs.seed)).toBe(true)
    expect(out!.provenance.seed).toBe(sent['3']!.inputs.seed)
    expect(sent['5']!.inputs).toMatchObject({ width: 832, height: 1216 })
  })

  it('falls back to polling /history when the WebSocket is unavailable', async () => {
    const { provider } = await setup({ ws: false })
    const [out] = await provider.generate(imageJob())
    expect(out!.mimeType).toBe('image/png')
  })

  it('reports execution errors with the failing node', async () => {
    const { provider } = await setup({ mode: 'error' })
    await expect(provider.generate(imageJob())).rejects.toMatchObject({
      code: 'PROVIDER',
      message: expect.stringMatching(/KSampler.*MPS out of memory/),
    })
  })

  it('explains validation failures by node', async () => {
    const { provider } = await setup({ mode: 'invalid' })
    await expect(provider.generate(imageJob())).rejects.toThrow(
      /node 4 \(CheckpointLoaderSimple\): Value not in list/,
    )
  })

  it('cancels: interrupts the prompt and removes it from the queue', async () => {
    const { fake, provider } = await setup({ mode: 'hang' })
    const ac = new AbortController()
    const run = provider.generate(imageJob({ signal: ac.signal }))
    setTimeout(() => ac.abort(), 100)
    await expect(run).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(fake.interrupts).toEqual([{ prompt_id: 'p-1' }])
    expect(fake.queueDeletes).toEqual([{ delete: ['p-1'] }])
  })

  it('times out per options.timeoutMs and cancels the prompt', async () => {
    const { fake, provider } = await setup({ mode: 'hang' }, { timeoutMs: 150 })
    await expect(provider.generate(imageJob())).rejects.toThrow(/did not finish within/)
    expect(fake.interrupts).toHaveLength(1)
  })

  it('image-to-video: uploads the scene image, converts seconds to frames, keeps a poster', async () => {
    const { fake, provider } = await setup({ outputName: 'clip_00001_.mp4' })
    const dir = outDir()
    const scene = join(dir, 'scene.png')
    writeFileSync(scene, tinyPng())
    const outputs = await provider.generate({
      kind: 'video',
      injectId: 'I-09',
      outDir: dir,
      inputImagePath: scene,
      brief: { paths: ['ai_video'], videoPrompt: 'travelers walk past', durationSec: 9 },
    })
    const sent = fake.prompts[0]!.prompt
    expect(fake.uploads).toHaveLength(1)
    expect(sent['78']!.inputs.image).toBe(fake.uploads[0])
    expect(sent['77']!.inputs.length).toBe(121) // clamped to 5 s → 24 fps · 5 = 120 → 8n + 1
    expect(sent['6']!.inputs.text).toBe('travelers walk past')
    expect(outputs[0]).toMatchObject({ kind: 'video', mimeType: 'video/mp4', durationSec: 5.04 })
    expect(outputs[0]!.provenance.model).toBe('ltxv-2b-0.9.8-distilled.safetensors')
    expect(outputs[0]!.posterPath).toMatch(/I-09-poster-\d+\.png$/)
  })

  it('refuses an image-to-video job without an input image before queueing', async () => {
    const { fake, provider } = await setup()
    await expect(
      provider.generate({
        kind: 'video',
        injectId: 'I-09',
        outDir: outDir(),
        brief: { paths: ['ai_video'], videoPrompt: 'x' },
      }),
    ).rejects.toThrow(/needs an input image/)
    expect(fake.prompts).toHaveLength(0)
  })

  it('uses a project workflow when the job writes inside that project', async () => {
    const { fake, provider } = await setup()
    const project = mkdtempSync(join(tmpdir(), 'ttx-proj-'))
    writeFileSync(join(project, 'project.json'), '{}')
    const wfDir = join(project, 'comfy', 'workflows')
    await fs.mkdir(wfDir, { recursive: true })
    writeFileSync(
      join(wfDir, 'mine.json'),
      JSON.stringify({ '1': { class_type: 'SaveImage', inputs: { filename_prefix: 'x' } } }),
    )
    writeFileSync(
      join(wfDir, 'mine.bindings.json'),
      JSON.stringify({
        name: 'Mine',
        mediaType: 'image',
        bindings: [
          { target: ['1', 'inputs', 'filename_prefix'], source: 'literal', value: 'bound' },
        ],
      }),
    )
    await provider.generate(
      imageJob({ workflowId: 'mine', outDir: join(project, 'scenarios', 's1', 'media', 'I-07') }),
    )
    expect(fake.prompts[0]!.prompt['1']!.inputs.filename_prefix).toBe('bound')
  })

  it('reports health from /system_stats and failure when unreachable', async () => {
    const { provider } = await setup()
    const health = await provider.health()
    expect(health).toMatchObject({ ok: true, message: 'ComfyUI 0.42.0 on mps' })
    await fake!.close()
    fake = undefined
    expect((await provider.health()).ok).toBe(false)
  })

  it('detects missing nodes per workflow from /object_info', async () => {
    const { provider } = await setup()
    await (provider as InstanceType<typeof ComfyMediaProvider>).nodeClasses()
    const list = await listWorkflows()
    const photo = list.find((w) => w.id === 'sdxl-photo')!
    const video = list.find((w) => w.id === 'image-to-video')!
    expect(photo.missingNodes).toEqual([])
    expect(video.missingNodes).toEqual(
      expect.arrayContaining(['LTXVImgToVideo', 'SamplerCustom', 'SaveVideo']),
    )
  })
})

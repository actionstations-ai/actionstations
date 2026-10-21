import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_LOCAL_MODEL,
  LocalOnnxEmbedder,
  assertModelId,
  downloadModel,
  isModelDownloaded,
  modelDims,
  progressTracker,
  type DownloadProgress,
} from './local-onnx'

const cos = (a: Float32Array, b: Float32Array): number => a.reduce((s, x, i) => s + x * b[i]!, 0)

describe('local ONNX model files', () => {
  it('accepts Hugging Face model ids and rejects path tricks', () => {
    expect(() => assertModelId('Xenova/bge-small-en-v1.5')).not.toThrow()
    for (const bad of ['../etc', 'a/../../b', '/abs/path', 'noslash', 'a/b/c', ''])
      expect(() => assertModelId(bad)).toThrow(expect.objectContaining({ code: 'VALIDATION' }))
  })

  it('knows the dimension of common models', () => {
    expect(modelDims('Xenova/bge-small-en-v1.5')).toBe(384)
    expect(modelDims('Xenova/bge-base-en-v1.5')).toBe(768)
  })

  it('is downloaded only when every required file exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-models-'))
    const modelDir = join(dir, DEFAULT_LOCAL_MODEL)
    expect(isModelDownloaded(dir, DEFAULT_LOCAL_MODEL)).toBe(false)
    mkdirSync(join(modelDir, 'onnx'), { recursive: true })
    for (const f of ['config.json', 'tokenizer.json', 'tokenizer_config.json'])
      writeFileSync(join(modelDir, f), '{}')
    expect(isModelDownloaded(dir, DEFAULT_LOCAL_MODEL)).toBe(false)
    writeFileSync(join(modelDir, 'onnx/model.onnx'), '')
    expect(isModelDownloaded(dir, DEFAULT_LOCAL_MODEL)).toBe(true)
  })

  it('refuses to embed (without any network call) when the model is not downloaded', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const e = new LocalOnnxEmbedder(DEFAULT_LOCAL_MODEL, mkdtempSync(join(tmpdir(), 'ttx-m-')))
    await expect(e.embed(['x'])).rejects.toMatchObject({
      code: 'PROVIDER',
      message: expect.stringMatching(/not downloaded/),
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('progressTracker', () => {
  it('aggregates per-file progress into one fraction', () => {
    const seen: DownloadProgress[] = []
    const track = progressTracker((p) => seen.push(p))
    track({ status: 'initiate', file: 'config.json' })
    track({ status: 'progress', file: 'config.json', loaded: 50, total: 100 })
    track({ status: 'progress', file: 'onnx/model.onnx', loaded: 0, total: 900 })
    expect(seen.at(-1)).toMatchObject({ progress: 0.05, loadedBytes: 50, totalBytes: 1000 })
    track({ status: 'done', file: 'config.json' })
    track({ status: 'progress', file: 'onnx/model.onnx', loaded: 900, total: 900 })
    expect(seen.at(-1)).toMatchObject({ progress: 1, loadedBytes: 1000 })
    track({ status: 'ready' })
    expect(seen).toHaveLength(4)
  })
})

const LIVE_MODELS_DIR = join(tmpdir(), 'ttx-test-models')

describe.runIf(process.env.LIVE === '1')('LocalOnnxEmbedder (LIVE, bge-small)', () => {
  it('downloads once, then embeds offline with unit-length 384-d vectors', async () => {
    const progress: number[] = []
    if (!isModelDownloaded(LIVE_MODELS_DIR, DEFAULT_LOCAL_MODEL))
      await downloadModel(LIVE_MODELS_DIR, DEFAULT_LOCAL_MODEL, (p) => progress.push(p.progress))
    expect(isModelDownloaded(LIVE_MODELS_DIR, DEFAULT_LOCAL_MODEL)).toBe(true)

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const e = new LocalOnnxEmbedder(DEFAULT_LOCAL_MODEL, LIVE_MODELS_DIR)
    const [fids, snow] = await e.embed([
      'FIDS Failure: Airlines make all announcements manually at gates; Ops uses whiteboards.',
      'Snow removal priorities: runways first, then taxiways and the terminal ramp.',
    ])
    expect(fids).toHaveLength(384)
    expect(cos(fids!, fids!)).toBeCloseTo(1, 4)
    const q = await e.embedQuery('what happens when the flight information displays go dark')
    expect(cos(q, fids!)).toBeGreaterThan(cos(q, snow!))
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    await e.dispose()
  }, 600_000)
})

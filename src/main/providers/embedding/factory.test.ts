import { describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

const { createEmbedder, embedderKey, withKnownDims } = await import('./factory')
const { HashEmbedder } = await import('./hash')
const { LocalOnnxEmbedder } = await import('./local-onnx')
const { embedQuery } = await import('./query-aware')

import type { ProviderConfig } from '@shared/schemas'

const provider = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: 'p1',
  kind: 'mock',
  label: 'Mock',
  options: {},
  enabled: true,
  ...over,
})
const deps = (providers: ProviderConfig[] = []) => ({ modelsDir: tmpdir(), providers })
const model = 'Xenova/bge-small-en-v1.5'

describe('createEmbedder', () => {
  it('defaults to the offline hash embedder', async () => {
    const e = await createEmbedder({ mode: 'hash', model }, deps())
    expect(e).toBeInstanceOf(HashEmbedder)
    expect(embedderKey(e)).toBe('hash:feature-hash-v1')
  })

  it('creates a lazy local ONNX embedder without touching the model files', async () => {
    const e = await createEmbedder({ mode: 'local-onnx', model }, deps())
    expect(e).toBeInstanceOf(LocalOnnxEmbedder)
    expect(e.dims).toBe(384)
    expect(embedderKey(e)).toBe(`local-onnx:${model}`)
  })

  it('uses the configured provider adapter', async () => {
    const e = await createEmbedder(
      { mode: 'provider', model: 'nomic-embed-text', providerId: 'p1' },
      deps([provider()]),
    )
    expect(e.dims).toBe(384)
    expect(await embedQuery(e, 'FIDS failure')).toHaveLength(384)
  })

  it('explains missing, unknown, disabled and unsupported providers', async () => {
    const settings = { mode: 'provider' as const, model: 'm' }
    await expect(createEmbedder({ ...settings, providerId: 'nope' }, deps())).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    )
    await expect(
      createEmbedder({ ...settings, providerId: 'p1' }, deps([provider({ enabled: false })])),
    ).rejects.toMatchObject({ code: 'PROVIDER' })
    // The Anthropic adapter has no embeddings endpoint.
    await expect(
      createEmbedder({ ...settings, providerId: 'p1' }, deps([provider({ kind: 'anthropic' })])),
    ).rejects.toMatchObject(
      expect.objectContaining({
        code: 'PROVIDER',
        message: expect.stringMatching(/not available/),
      }),
    )
  })

  it('without a provider id, uses the Embeddings routing row (with the project path)', async () => {
    const routed = new HashEmbedder()
    const resolveRouted = vi.fn(async () => ({ provider: routed }))
    const e = await createEmbedder(
      { mode: 'provider', model },
      { ...deps(), projectPath: '/p/rivergate', resolveRouted },
    )
    expect(e).toBe(routed)
    expect(resolveRouted).toHaveBeenCalledWith('/p/rivergate')
  })

  it('points at Providers → Routing when the Embeddings row is empty', async () => {
    const { AppError } = await import('../../lib/errors')
    const resolveRouted = vi.fn(async () => {
      throw new AppError('VALIDATION', "No provider is assigned to 'embed'.")
    })
    await expect(
      createEmbedder({ mode: 'provider', model }, { ...deps(), resolveRouted }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringMatching(/Embeddings row in Providers → Routing/),
    })
  })
})

describe('withKnownDims', () => {
  class LazyDims {
    readonly id = 'lazy'
    readonly model = 'nomic-embed-text'
    dims = 0
    calls = 0
    constructor(private readonly fail = false) {}
    async embed(texts: string[]) {
      this.calls++
      if (this.fail) throw new Error('connect ECONNREFUSED 127.0.0.1:1234')
      this.dims = 768
      return texts.map(() => new Float32Array(768))
    }
  }

  it('probes once so the index knows the vector size before creating its table', async () => {
    const e = new LazyDims()
    expect((await withKnownDims(e)).dims).toBe(768)
    await withKnownDims(e)
    expect(e.calls).toBe(1)
  })

  it('reports an unreachable provider as a PROVIDER error', async () => {
    await expect(withKnownDims(new LazyDims(true))).rejects.toMatchObject({
      code: 'PROVIDER',
      message: expect.stringMatching(/Could not reach the embeddings provider.*ECONNREFUSED/),
    })
  })
})

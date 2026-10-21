import { describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

const { createEmbedder, embedderKey } = await import('./factory')
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
    await expect(createEmbedder(settings, deps())).rejects.toMatchObject({ code: 'VALIDATION' })
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
})

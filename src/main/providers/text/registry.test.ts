import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { adapterFor, listAdapterKinds } = await import('../registry')

describe('text adapters are discovered by the registry', () => {
  it('registers anthropic, openai-compatible and ollama', () => {
    expect(listAdapterKinds()).toEqual(
      expect.arrayContaining(['anthropic', 'openai-compatible', 'ollama']),
    )
    expect(adapterFor('openai-compatible').createMedia).toBeTypeOf('function')
    expect(adapterFor('ollama').localDefaults).toEqual([
      { label: 'Ollama', baseUrl: 'http://127.0.0.1:11434' },
    ])
  })
})

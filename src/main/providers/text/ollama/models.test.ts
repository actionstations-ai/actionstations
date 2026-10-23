import { describe, expect, it } from 'vitest'
import { chatModelsBySize, classifyOllamaTags, ollamaModelKind } from './models'

describe('ollamaModelKind (#225)', () => {
  it('maps completion to chat and embedding-only to embedding', () => {
    expect(ollamaModelKind('qwen2.5:3b', ['completion', 'tools'])).toBe('chat')
    expect(ollamaModelKind('all-minilm:22m', ['embedding'])).toBe('embedding')
    expect(ollamaModelKind('vision-thing', ['vision'])).toBe('unknown')
  })

  it('falls back to the name when no capabilities are reported', () => {
    expect(ollamaModelKind('all-minilm:22m', undefined)).toBe('embedding')
    expect(ollamaModelKind('bge-m3', [])).toBe('embedding')
    expect(ollamaModelKind('llama3.1:8b', undefined)).toBe('chat')
  })
})

describe('chatModelsBySize', () => {
  it('lists chat models largest first and drops embedding models', async () => {
    const models = await classifyOllamaTags(
      {
        models: [
          { name: 'smollm:135m', size: 91_739_413, capabilities: ['completion'] },
          { name: 'all-minilm:22m', size: 45_960_996, capabilities: ['embedding'] },
          { name: 'qwen2.5:3b', size: 1_929_912_432, capabilities: ['completion', 'tools'] },
          { name: 'mxbai-embed-large', size: 669_000_000 },
        ],
      },
      () => Promise.reject(new Error('offline')),
    )
    expect(chatModelsBySize(models)).toEqual(['qwen2.5:3b', 'smollm:135m'])
  })
})

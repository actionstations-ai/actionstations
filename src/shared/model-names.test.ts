import { describe, expect, it } from 'vitest'
import { looksLikeEmbeddingModel, pickChatModel } from './model-names'

describe('looksLikeEmbeddingModel (#225)', () => {
  it.each([
    'all-minilm:22m',
    'nomic-embed-text:latest',
    'text-embedding-nomic-embed-text-v1.5',
    'mxbai-embed-large',
    'snowflake-arctic-embed:110m',
    'bge-m3',
    'Xenova/bge-small-en-v1.5',
    'multilingual-e5-large',
    'gte-base',
    'granite-embedding:30m',
    'paraphrase-multilingual',
  ])('flags %s as an embedding model', (id) => {
    expect(looksLikeEmbeddingModel(id)).toBe(true)
  })

  it.each([
    'qwen3-30b-a3b-2507',
    'qwen2.5:3b',
    'gpt-oss-20b',
    'llama3.1:8b',
    'smollm:135m',
    'gemma3:27b',
    'mistral-small3.2',
    'deepseek-r1:14b',
  ])('keeps %s as a chat model', (id) => {
    expect(looksLikeEmbeddingModel(id)).toBe(false)
  })
})

describe('pickChatModel', () => {
  it('prefers a loaded chat model, then the first in the given order', () => {
    expect(pickChatModel(['gemma3:27b', 'qwen2.5:3b'], ['qwen2.5:3b'])).toBe('qwen2.5:3b')
    expect(pickChatModel(['gemma3:27b', 'qwen2.5:3b'])).toBe('gemma3:27b')
  })

  it('never picks an embedding model while a chat model exists', () => {
    expect(pickChatModel(['all-minilm:22m', 'smollm:135m'], ['all-minilm:22m'])).toBe('smollm:135m')
  })
})

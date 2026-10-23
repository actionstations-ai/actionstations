import { describe, expect, it } from 'vitest'
import { modelSuggestions } from './model-suggestions'

const MODELS = [
  { id: 'qwen2.5:3b', kind: 'chat' as const },
  { id: 'all-minilm:22m', kind: 'chat' as const }, // misreported: caught by name
  { id: 'nomic-embed-text', kind: 'embedding' as const },
  { id: 'smollm:135m', kind: 'unknown' as const },
]

describe('modelSuggestions (#225)', () => {
  it('chat pickers never suggest embedding models', () => {
    expect(modelSuggestions(MODELS, 'chat')).toEqual(['qwen2.5:3b', 'smollm:135m'])
  })

  it('embedding pickers suggest embedding models, or everything when none are known', () => {
    expect(modelSuggestions(MODELS, 'embedding')).toEqual(['all-minilm:22m', 'nomic-embed-text'])
    expect(modelSuggestions([{ id: 'custom', kind: 'unknown' }], 'embedding')).toEqual(['custom'])
  })

  it('no purpose keeps every model', () => {
    expect(modelSuggestions(MODELS)).toHaveLength(4)
  })
})

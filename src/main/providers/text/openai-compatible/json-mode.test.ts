import { describe, expect, it } from 'vitest'
import { defaultModeFor } from './json-mode'

describe('defaultModeFor', () => {
  it('starts gpt-oss-20b from json_object (truncated items under json_schema, #81)', () => {
    expect(defaultModeFor('openai/gpt-oss-20b')).toBe('json_object')
  })

  it('starts gpt-oss-120b from json_schema (json_object makes LM Studio fail with a 500, #503)', () => {
    expect(defaultModeFor('openai/gpt-oss-120b')).toBe('json_schema')
  })

  it('starts ordinary models from json_schema', () => {
    expect(defaultModeFor('qwen/qwen3-30b-a3b-2507')).toBe('json_schema')
  })
})

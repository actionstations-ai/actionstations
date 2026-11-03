import { describe, expect, it } from 'vitest'
import { ModelProfile } from './schemas/model-profile'
import {
  MODEL_PROFILES,
  draftCandidate,
  findModelProfile,
  resolveInference,
} from './model-profiles'

describe('model profile table', () => {
  it('validates against the schema and cites a source for every profile', () => {
    for (const p of MODEL_PROFILES) {
      expect(ModelProfile.safeParse(p).success, p.id).toBe(true)
      expect(p.source.every((s) => s.startsWith('https://huggingface.co/'))).toBe(true)
    }
  })

  it.each([
    ['qwen/qwen3-30b-a3b-thinking-2507', 'qwen3-thinking-2507'],
    ['qwen/qwen3-30b-a3b-2507', 'qwen3-instruct-2507'],
    ['qwen/qwen3.5-9b', 'qwen3.5'],
    ['qwen/qwen3.6-27b', 'qwen3.6'],
    ['qwen/qwen3.8-27b', 'qwen3.8'],
    ['openai/gpt-oss-120b', 'gpt-oss'],
    ['lmstudio-community/gemma-4-26B-A4B-it-MLX-4bit', 'gemma-4'],
    ['google/gemma-4-26b-a4b', 'gemma-4'],
    ['zai-org/glm-4.7-flash', 'glm-4.7'],
    ['nvidia/nemotron-3.5-lightning', 'nemotron-3.5'],
  ])('matches %s to %s', (id, profile) => {
    expect(findModelProfile(id)?.id).toBe(profile)
  })

  it('matches nothing for models without a profile', () => {
    expect(findModelProfile('llama3.1:8b')).toBeUndefined()
    expect(findModelProfile('qwen2.5-coder-14b')).toBeUndefined()
  })
})

describe('resolveInference', () => {
  it('keeps the stage temperature and adds nothing for an unknown model', () => {
    expect(resolveInference({ modelId: 'llama3.1:8b', stageTemperature: 0.3 })).toEqual({
      temperature: 0.3,
    })
    expect(resolveInference({ modelId: 'llama3.1:8b' })).toEqual({})
  })

  it('replaces greedy stage temperature with the card value where the card forbids it', () => {
    const r = resolveInference({ modelId: 'qwen/qwen3.5-9b', stageTemperature: 0 })
    expect(r).toMatchObject({ temperature: 1, topP: 0.95, topK: 20, minP: 0 })
  })

  it('adds the gpt-oss card top_p and keeps the stage temperature (measured, #585)', () => {
    const r = resolveInference({ modelId: 'openai/gpt-oss-120b', stageTemperature: 0.2 })
    expect(r).toMatchObject({ temperature: 0.2, topP: 1 })
  })

  it('lets the stage temperature win where the card allows lower values', () => {
    const r = resolveInference({ modelId: 'qwen/qwen3-30b-a3b-2507', stageTemperature: 0.2 })
    expect(r).toMatchObject({ temperature: 0.2, topP: 0.8, topK: 20 })
  })

  it('falls back to the card temperature when the stage sets none', () => {
    expect(resolveInference({ modelId: 'qwen/qwen3-30b-a3b-2507' }).temperature).toBe(0.7)
  })

  it('passes only the stage temperature when profiles are off', () => {
    const r = resolveInference({
      modelId: 'openai/gpt-oss-120b',
      stageTemperature: 0.4,
      options: { modelProfile: 'off' },
    })
    expect(r).toEqual({ temperature: 0.4 })
  })

  it('uses the profile reasoning default and lets the option override it', () => {
    const base = { modelId: 'openai/gpt-oss-120b' }
    expect(resolveInference(base).reasoning).toEqual({ kind: 'effort', level: 'medium' })
    const low = resolveInference({ ...base, options: { reasoningEffort: 'low' } })
    expect(low.reasoning).toEqual({ kind: 'effort', level: 'low' })
  })

  it('treats a level as "on" and "off" as off for a switch model', () => {
    const q = 'qwen/qwen3.6-27b'
    expect(resolveInference({ modelId: q }).reasoning).toEqual({ kind: 'switch', level: 'on' })
    const off = resolveInference({ modelId: q, options: { reasoningEffort: 'off' } })
    expect(off.reasoning).toEqual({ kind: 'switch', level: 'off' })
    const low = resolveInference({ modelId: q, options: { reasoningEffort: 'low' } })
    expect(low.reasoning).toEqual({ kind: 'switch', level: 'on' })
  })

  it('ignores a bad reasoning option and models without reasoning control', () => {
    const bad = resolveInference({ modelId: 'openai/gpt-oss-20b', options: { reasoningEffort: 9 } })
    expect(bad.reasoning?.level).toBe('medium')
    expect(resolveInference({ modelId: 'google/gemma-4-26b-a4b' }).reasoning).toBeUndefined()
  })
})

describe('measured defaults', () => {
  it('runs Qwen3.5 with thinking off unless the provider turns it on (quick suite, #585)', () => {
    const q = 'qwen/qwen3.5-9b'
    expect(resolveInference({ modelId: q }).reasoning).toEqual({ kind: 'switch', level: 'off' })
    const on = resolveInference({ modelId: q, options: { reasoningEffort: 'on' } })
    expect(on.reasoning).toEqual({ kind: 'switch', level: 'on' })
  })

  it('prefers the GGUF build of gpt-oss-120b and records why', () => {
    const build = findModelProfile('openai/gpt-oss-120b')?.preferredBuild
    expect(build?.format).toBe('gguf')
    expect(build?.reason).toMatch(/MLX/)
  })
})

describe('structured output mode', () => {
  it('starts gpt-oss-20b from json_object and gpt-oss-120b from json_schema', () => {
    expect(findModelProfile('openai/gpt-oss-20b')?.structuredOutput).toBe('json_object')
    expect(findModelProfile('openai/gpt-oss-120b')?.structuredOutput).toBe('json_schema')
    expect(findModelProfile('mlx-community/gpt-oss-120b-MXFP4-Q4')?.structuredOutput).toBe(
      'json_schema',
    )
  })
})

describe('draft model', () => {
  const draft = 'qwen/qwen3.5-4b'
  const model = 'qwen/qwen3.5-9b'
  const options = { draftModel: draft }

  it('is used only when the server has it installed', () => {
    const installed = new Set([draft, model])
    expect(
      resolveInference({ modelId: model, options, installedModels: installed }).draftModel,
    ).toBe(draft)
    const none = resolveInference({ modelId: model, options, installedModels: new Set() })
    expect(none.draftModel).toBeUndefined()
    expect(resolveInference({ modelId: model, options }).draftModel).toBeUndefined()
  })

  it('can be switched off and never drafts itself', () => {
    expect(draftCandidate(model, { draftModel: 'off' })).toBeUndefined()
    expect(draftCandidate(model, { draftModel: model })).toBeUndefined()
  })
})

// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { AppSettings } from '@shared/schemas'
import {
  defaultTextChoice,
  formatLatency,
  loadProgress,
  mediaAssignments,
  nextStep,
  pickChatModel,
  pickTtsModel,
  previousStep,
  routeTasks,
  saveProgress,
  shouldOnboard,
  textProviders,
  type ProviderViewT,
} from './wizard-state'

const view = (over: Partial<ProviderViewT>): ProviderViewT => ({
  id: 'p1',
  kind: 'openai-compatible',
  label: 'LM Studio',
  baseUrl: 'http://127.0.0.1:1234/v1',
  options: {},
  enabled: true,
  hasKey: false,
  ...over,
})

afterEach(() => localStorage.clear())

describe('shouldOnboard', () => {
  it('sends a fresh install to the wizard', () => {
    expect(shouldOnboard(AppSettings.parse({}))).toBe(true)
  })
  it('skips it once setup is complete', () => {
    expect(shouldOnboard(AppSettings.parse({ onboardingComplete: true }))).toBe(false)
  })
  it('skips it for existing users who already configured a provider', () => {
    const settings = AppSettings.parse({ providers: [view({})] })
    expect(shouldOnboard(settings)).toBe(false)
  })
  it('ignores the seeded mock provider', () => {
    const settings = AppSettings.parse({ providers: [view({ id: 'mock', kind: 'mock' })] })
    expect(shouldOnboard(settings)).toBe(true)
  })
})

describe('step order and resume', () => {
  it('walks forward to done and back to the start', () => {
    expect(nextStep('welcome')).toBe('text')
    expect(nextStep('project')).toBe('done')
    expect(previousStep('text')).toBe('welcome')
    expect(previousStep('welcome')).toBe('welcome')
    expect(previousStep('done')).toBe('project')
  })
  it('remembers the step and created project', () => {
    saveProgress({ step: 'search', projectPath: '/p/A' })
    expect(loadProgress()).toEqual({ step: 'search', projectPath: '/p/A' })
  })
  it('starts over when storage holds something unexpected', () => {
    localStorage.setItem('ttx.onboarding', '{"step":"nope"}')
    expect(loadProgress()).toEqual({ step: 'welcome' })
    localStorage.setItem('ttx.onboarding', 'not json')
    expect(loadProgress()).toEqual({ step: 'welcome' })
  })
})

describe('routing helpers', () => {
  it('replaces only the given tasks', () => {
    const out = routeTasks(
      { image: { providerId: 'comfy' }, draft: { providerId: 'old' } },
      ['draft', 'ideate'],
      {
        providerId: 'lm',
        model: 'qwen',
      },
    )
    expect(out).toEqual({
      image: { providerId: 'comfy' },
      draft: { providerId: 'lm', model: 'qwen' },
      ideate: { providerId: 'lm', model: 'qwen' },
    })
  })
  it('routes ComfyUI to image and video and the voice server to audio with its model', () => {
    const comfy = view({ id: 'comfy', kind: 'comfyui' })
    const voice = view({ id: 'tts', options: { ttsModel: 'voxcpm' } })
    expect(mediaAssignments(comfy, voice, { comfy: true, voice: true })).toEqual([
      { tasks: ['image', 'video'], ref: { providerId: 'comfy' } },
      { tasks: ['audio'], ref: { providerId: 'tts', model: 'voxcpm' } },
    ])
    expect(mediaAssignments(comfy, voice, { comfy: false, voice: false })).toEqual([])
  })
  it('defaults the text choice to the provider already routed to drafting', () => {
    const a = view({ id: 'a', defaultModel: 'm-a' })
    const b = view({ id: 'b', defaultModel: 'm-b' })
    expect(defaultTextChoice([a, b], { providerId: 'b', model: 'x' })).toEqual({
      providerId: 'b',
      model: 'x',
    })
    expect(defaultTextChoice([a, b], undefined)).toEqual({ providerId: 'a', model: 'm-a' })
    expect(defaultTextChoice([], undefined)).toBeNull()
  })
  it('lists text providers without the voice server', () => {
    const tts = view({ id: 'tts', options: { ttsModel: 'v' } })
    const comfy = view({ id: 'c', kind: 'comfyui' })
    const lm = view({ id: 'lm' })
    expect(textProviders([tts, comfy, lm]).map((p) => p.id)).toEqual(['lm'])
  })
})

describe('model and display helpers', () => {
  it('prefers a chat model over an embedding model', () => {
    expect(pickChatModel(['text-embedding-nomic', 'qwen3-30b'])).toBe('qwen3-30b')
  })
  it('prefers a loaded chat model, ignoring loaded embedding models', () => {
    const models = ['gpt-oss-20b', 'qwen3-30b', 'text-embedding-nomic']
    expect(pickChatModel(models, ['text-embedding-nomic', 'qwen3-30b'])).toBe('qwen3-30b')
    expect(pickChatModel(models, ['text-embedding-nomic'])).toBe('gpt-oss-20b')
  })
  it('prefers a general speech model over a VoiceDesign one', () => {
    expect(
      pickTtsModel([
        'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16',
        'mlx-community/VoxCPM2-8bit',
      ]),
    ).toBe('mlx-community/VoxCPM2-8bit')
    expect(pickTtsModel(['something'])).toBe('something')
    expect(pickTtsModel([])).toBeUndefined()
  })
  it('formats latency', () => {
    expect(formatLatency(412.4)).toBe('412 ms')
    expect(formatLatency(2350)).toBe('2.4 s')
  })
})

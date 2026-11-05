// Paid media confirmation: counting planned calls per remote provider, the estimate, and the
// decision about whom to ask.
import { describe, expect, it } from 'vitest'
import type { Inject, MediaBrief, ProviderConfig } from '@shared/schemas'
import {
  countPaidCalls,
  plannedTasks,
  providersToAsk,
  tasksForInject,
  totalEstimate,
} from './media-confirm'

const config = (over: Partial<ProviderConfig>): ProviderConfig =>
  ({
    id: 'p',
    label: 'Provider',
    kind: 'openai-compatible',
    enabled: true,
    options: {},
    ...over,
  }) as ProviderConfig

const REMOTE = config({
  id: 'fal',
  label: 'fal.ai',
  baseUrl: 'https://fal.run/v1',
  options: { network: 'remote' },
})
const LOCAL = config({ id: 'comfy', label: 'ComfyUI', baseUrl: 'http://127.0.0.1:8188' })

const brief = (paths: MediaBrief['paths']): MediaBrief => ({ paths }) as MediaBrief
const inject = (paths?: MediaBrief['paths']): Inject =>
  ({ id: 'i', mselRowId: 'r', ...(paths ? { mediaBrief: brief(paths) } : {}) }) as Inject
const withPrices = (options: Record<string, unknown>): ProviderConfig => ({
  ...REMOTE,
  options: { ...REMOTE.options, ...options },
})

describe('planned tasks', () => {
  it('maps render paths to media tasks and ignores the template step', () => {
    expect(tasksForInject(brief(['ai_image', 'template', 'tts', 'ai_video']))).toEqual([
      'image',
      'audio',
      'video',
    ])
  })

  it('narrows to the forced paths, and counts them when there is no brief yet', () => {
    expect(tasksForInject(brief(['ai_image', 'tts']), ['tts'])).toEqual(['audio'])
    expect(tasksForInject(undefined, ['ai_video'])).toEqual(['video'])
    expect(tasksForInject(undefined)).toEqual([])
  })

  it('sums over injects', () => {
    expect(plannedTasks([inject(['ai_image']), inject(['ai_image', 'tts'])])).toEqual([
      'image',
      'image',
      'audio',
    ])
  })
})

describe('countPaidCalls', () => {
  it('counts per provider and task and leaves local providers out', () => {
    const paid = countPaidCalls(['image', 'image', 'video', 'audio'], {
      image: REMOTE,
      video: REMOTE,
      audio: LOCAL,
    })
    expect(paid).toHaveLength(1)
    expect(paid[0]).toMatchObject({
      providerId: 'fal',
      host: 'fal.run',
      counts: { image: 2, video: 1, audio: 0 },
    })
  })

  it('never asks for a batch that only uses local providers', () => {
    expect(countPaidCalls(['image', 'audio'], { image: LOCAL, audio: LOCAL })).toEqual([])
  })

  it('estimates with the per-task price, else the general price', () => {
    const priced = withPrices({ mediaUsdPerCall: 0.1, videoUsdPerCall: 0.5 })
    const [p] = countPaidCalls(['image', 'image', 'video'], { image: priced, video: priced })
    expect(p!.estimateUsd).toBe(0.7)
  })

  it('gives no estimate when any planned call has no price', () => {
    const half = withPrices({ imageUsdPerCall: 0.04 })
    const [p] = countPaidCalls(['image', 'video'], { image: half, video: half })
    expect(p!.estimateUsd).toBeUndefined()
    expect(totalEstimate([p!])).toBeUndefined()
  })

  it('ignores prices that are not non-negative numbers', () => {
    const [p] = countPaidCalls(['image'], { image: withPrices({ mediaUsdPerCall: '0.1' }) })
    expect(p!.estimateUsd).toBeUndefined()
  })

  it('totals the providers when all have an estimate', () => {
    const a = {
      providerId: 'a',
      label: 'A',
      host: '',
      counts: { image: 1, video: 0, audio: 0 },
      estimateUsd: 0.1,
    }
    const b = { ...a, providerId: 'b', estimateUsd: 0.25 }
    expect(totalEstimate([a, b])).toBe(0.35)
  })
})

describe('providersToAsk', () => {
  it('drops providers the user chose not to be asked about', () => {
    const a = { providerId: 'a', label: 'A', host: '', counts: { image: 1, video: 0, audio: 0 } }
    const b = { ...a, providerId: 'b' }
    expect(providersToAsk([a, b], ['a']).map((p) => p.providerId)).toEqual(['b'])
    expect(providersToAsk([a, b], ['a', 'b'])).toEqual([])
  })
})

// Paid media confirmation: counting planned calls per remote provider, the estimate, and the
// decision about whom to ask.
import { describe, expect, it } from 'vitest'
import type { Inject, MediaBrief, ProviderConfig } from '@shared/schemas'
import {
  countPaidCalls,
  callsForInject,
  plannedCalls,
  providersToAsk,
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

const typed = (type: string, paths?: MediaBrief['paths']): Inject =>
  ({ ...inject(paths), type }) as Inject
const tasks = (calls: { task: string }[]) => calls.map((c) => c.task)

describe('planned calls', () => {
  it('is exact from the plan and ignores the template step', () => {
    const calls = callsForInject(typed('tweet', ['ai_image', 'template', 'tts', 'ai_video']))
    expect(tasks(calls)).toEqual(['image', 'audio', 'video'])
    expect(calls.every((c) => !c.upTo)).toBe(true)
  })

  it('narrows a plan to the forced paths', () => {
    expect(tasks(callsForInject(typed('tweet', ['ai_image', 'tts']), ['tts']))).toEqual(['audio'])
  })

  it('is an upper bound from the type when there is no plan yet', () => {
    const calls = callsForInject(typed('radio_call'))
    expect(tasks(calls)).toContain('audio')
    expect(tasks(calls)).toContain('image')
    expect(calls.every((c) => c.upTo)).toBe(true)
    expect(tasks(callsForInject(typed('radio_call'), ['tts']))).toEqual(['audio'])
  })

  it('sums over injects', () => {
    expect(
      tasks(plannedCalls([typed('t', ['ai_image']), typed('t', ['ai_image', 'tts'])])),
    ).toEqual(['image', 'image', 'audio'])
  })
})

const exact = (...t: ('image' | 'video' | 'audio')[]) => t.map((task) => ({ task, upTo: false }))

describe('countPaidCalls', () => {
  it('marks a provider as an upper bound and still counts it when no plan exists', () => {
    const [p] = countPaidCalls([{ task: 'image', upTo: true }], { image: REMOTE })
    expect(p).toMatchObject({ providerId: 'fal', upTo: true, counts: { image: 1 } })
  })

  it('counts per provider and task and leaves local providers out', () => {
    const paid = countPaidCalls(exact('image', 'image', 'video', 'audio'), {
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
    expect(countPaidCalls(exact('image', 'audio'), { image: LOCAL, audio: LOCAL })).toEqual([])
  })

  it('estimates with the per-task price, else the general price', () => {
    const priced = withPrices({ mediaUsdPerCall: 0.1, videoUsdPerCall: 0.5 })
    const [p] = countPaidCalls(exact('image', 'image', 'video'), { image: priced, video: priced })
    expect(p!.estimateUsd).toBe(0.7)
  })

  it('gives no estimate when any planned call has no price', () => {
    const half = withPrices({ imageUsdPerCall: 0.04 })
    const [p] = countPaidCalls(exact('image', 'video'), { image: half, video: half })
    expect(p!.estimateUsd).toBeUndefined()
    expect(totalEstimate([p!])).toBeUndefined()
  })

  it('ignores prices that are not non-negative numbers', () => {
    const [p] = countPaidCalls(exact('image'), { image: withPrices({ mediaUsdPerCall: '0.1' }) })
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

describe('a batch with no media plans yet', () => {
  it('still asks, with upper-bound counts, when a paid provider is routed', () => {
    const paid = countPaidCalls(plannedCalls([typed('radio_call'), typed('tweet')]), {
      image: REMOTE,
      audio: REMOTE,
      video: REMOTE,
    })
    expect(paid).toHaveLength(1)
    expect(paid[0]).toMatchObject({ upTo: true })
    expect(paid[0]!.counts.image).toBeGreaterThanOrEqual(2)
    expect(providersToAsk(paid, [])).toHaveLength(1)
  })

  it('gives exact counts once plans exist', () => {
    const paid = countPaidCalls(plannedCalls([typed('tweet', ['ai_image'])]), { image: REMOTE })
    expect(paid[0]!.upTo).toBeUndefined()
    expect(paid[0]!.counts).toEqual({ image: 1, video: 0, audio: 0 })
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

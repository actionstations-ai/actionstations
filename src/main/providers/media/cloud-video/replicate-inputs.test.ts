// The brief → input mapping for the Replicate models in the shared table.
import { describe, expect, it } from 'vitest'
import type { MediaBrief } from '@shared/schemas'
import { buildInputs, effectiveInputs, knownModel, suggestedModels } from './inputs'

const brief = (extra: Partial<MediaBrief> = {}): MediaBrief => ({
  paths: ['ai_video'],
  negativePrompt: 'text, watermark',
  durationSec: 7,
  ...extra,
})

const ctx = (extra: Record<string, unknown> = {}) => ({
  brief: brief(),
  prompt: 'A flickering board',
  imageUri: 'data:image/png;base64,AAAA',
  width: 1216,
  height: 832,
  ...extra,
})

describe('Replicate models', () => {
  const replicate = suggestedModels('video', 'replicate').map((m) => m.id)

  it('lists its own suggestions apart from fal.ai', () => {
    expect(replicate).toContain('kwaivgi/kling-v2.5-turbo-pro')
    expect(replicate.length).toBeGreaterThanOrEqual(4)
    expect(suggestedModels('video').map((m) => m.id)).not.toContain('kwaivgi/kling-v2.5-turbo-pro')
    expect(suggestedModels('image', 'replicate').map((m) => m.id)).toEqual([
      'black-forest-labs/flux-schnell',
      'black-forest-labs/flux-1.1-pro',
      'google/imagen-4-fast',
    ])
  })

  it('sends whole-number durations and drops the aspect ratio next to a starting image (Kling)', () => {
    const body = buildInputs(knownModel('kwaivgi/kling-v2.5-turbo-pro')!, ctx())
    expect(body).toEqual({
      prompt: 'A flickering board',
      negative_prompt: 'text, watermark',
      start_image: 'data:image/png;base64,AAAA',
      duration: 5,
    })
  })

  it('keeps the aspect ratio for a text-only Kling clip', () => {
    const map = knownModel('kwaivgi/kling-v2.5-turbo-pro')!
    const body = buildInputs(map, ctx({ imageUri: undefined }))
    expect(body).toMatchObject({ aspect_ratio: '16:9', duration: 5 })
    expect(body).not.toHaveProperty('start_image')
  })

  it('maps Seedance, with a seed and any length from 2 to 12 seconds', () => {
    const map = knownModel('bytedance/seedance-1-pro-fast')!
    expect(buildInputs(map, ctx({ seed: 9 }))).toEqual({
      prompt: 'A flickering board',
      image: 'data:image/png;base64,AAAA',
      duration: 7,
      seed: 9,
    })
  })

  it('maps Hailuo to its first frame and the 6 second length', () => {
    expect(buildInputs(knownModel('minimax/hailuo-02')!, ctx())).toEqual({
      prompt: 'A flickering board',
      first_frame_image: 'data:image/png;base64,AAAA',
      duration: 6,
    })
  })

  it('needs a starting image for Wan image-to-video and sends its negative prompt', () => {
    const map = knownModel('wan-video/wan-2.5-i2v-fast')!
    expect(map.imageRequired).toBe(true)
    expect(buildInputs(map, ctx())).toMatchObject({
      negative_prompt: 'text, watermark',
      image: 'data:image/png;base64,AAAA',
      duration: 5,
    })
  })

  it('rounds Veo to 4, 6 or 8 seconds and keeps the aspect ratio', () => {
    const body = buildInputs(knownModel('google/veo-3.1-fast')!, ctx())
    expect(body).toMatchObject({ duration: 6, aspect_ratio: '16:9' })
  })

  it('maps LTX 2 Fast to even lengths from 6 to 20 seconds', () => {
    const map = knownModel('lightricks/ltx-2-fast')!
    expect(buildInputs(map, ctx())).toMatchObject({ duration: 6 })
    const long = ctx({ brief: brief({ durationSec: 15 }) })
    expect(buildInputs(map, long)).toMatchObject({ duration: 14 })
  })

  it('maps the image models to an aspect ratio and no fal.ai size preset', () => {
    const portrait = ctx({ imageUri: undefined, width: 832, height: 1216, seed: 3 })
    for (const id of ['black-forest-labs/flux-schnell', 'black-forest-labs/flux-1.1-pro'])
      expect(buildInputs(knownModel(id)!, portrait)).toEqual({
        prompt: 'A flickering board',
        aspect_ratio: '2:3',
        seed: 3,
      })
    const imagen = knownModel('google/imagen-4-fast')!
    expect(buildInputs(imagen, ctx({ width: 1216, height: 832 }))).toEqual({
      prompt: 'A flickering board',
      aspect_ratio: '4:3',
    })
  })

  it('keeps durations numeric when the user renames the duration input', () => {
    const map = effectiveInputs('video', 'kwaivgi/kling-v2.5-turbo-pro', { duration: 'seconds' })
    expect(buildInputs(map, ctx())).toMatchObject({ seconds: 5 })
  })
})

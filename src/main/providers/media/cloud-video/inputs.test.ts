// The brief → model input mapping shared by the cloud media adapters.
import { describe, expect, it } from 'vitest'
import type { MediaBrief } from '@shared/schemas'
import {
  buildInputs,
  clampDuration,
  effectiveInputs,
  KNOWN_MODELS,
  knownModel,
  nearestAspect,
  nearestImageSize,
  readInputMap,
  suggestedModels,
} from './inputs'

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

describe('known models', () => {
  it('lists video and image suggestions', () => {
    expect(suggestedModels('video').length).toBeGreaterThanOrEqual(4)
    expect(suggestedModels('image').map((m) => m.id)).toContain('fal-ai/flux/schnell')
    for (const [id, m] of Object.entries(KNOWN_MODELS)) expect(m.label, id).toBeTruthy()
  })

  it('finds a model whatever the case or slashes', () => {
    expect(knownModel('/FAL-AI/flux-2/')?.kind).toBe('image')
  })
})

describe('buildInputs', () => {
  it('fills Kling with its own field names and a duration it accepts', () => {
    const map = knownModel('fal-ai/kling-video/v2.5-turbo/pro/image-to-video')!
    expect(buildInputs(map, ctx())).toEqual({
      prompt: 'A flickering board',
      negative_prompt: 'text, watermark',
      duration: '5',
      image_url: 'data:image/png;base64,AAAA',
    })
  })

  it('names the starting image start_image_url for Kling 3', () => {
    const map = knownModel('fal-ai/kling-video/v3/pro/image-to-video')!
    const body = buildInputs(map, ctx())
    expect(body.start_image_url).toBe('data:image/png;base64,AAAA')
    expect(body.duration).toBe('7')
  })

  it('leaves out the negative prompt for a model without one', () => {
    const map = knownModel('fal-ai/minimax/hailuo-02/standard/image-to-video')!
    expect(buildInputs(map, ctx())).not.toHaveProperty('negative_prompt')
  })

  it('sends an aspect ratio only to a text-to-video model', () => {
    const t2v = knownModel('fal-ai/kling-video/v2.5-turbo/pro/text-to-video')!
    expect(buildInputs(t2v, ctx({ imageUri: undefined }))).toMatchObject({ aspect_ratio: '16:9' })
    const ltx = knownModel('fal-ai/ltx-2.5/image-to-video/fast')!
    expect(buildInputs(ltx, ctx())).not.toHaveProperty('aspect_ratio')
    expect(buildInputs(ltx, ctx({ imageUri: undefined }))).toMatchObject({ aspect_ratio: '16:9' })
  })

  it('omits duration when the brief has none, and the image when there is none', () => {
    const map = knownModel('fal-ai/kling-video/v2.5-turbo/pro/image-to-video')!
    const body = buildInputs(
      map,
      ctx({ brief: brief({ durationSec: undefined }), imageUri: undefined }),
    )
    expect(Object.keys(body).sort()).toEqual(['negative_prompt', 'prompt'])
  })

  it('maps images to an image_size preset and passes the seed', () => {
    const map = knownModel('fal-ai/flux-pro/v1.1')!
    expect(buildInputs(map, ctx({ seed: 9, imageUri: undefined }))).toEqual({
      prompt: 'A flickering board',
      image_size: 'landscape_4_3',
      seed: 9,
    })
  })

  it('sends only the prompt for a model nobody described', () => {
    const map = effectiveInputs('video', 'acme/unknown', {})
    expect(buildInputs(map, ctx())).toEqual({ prompt: 'A flickering board' })
  })
})

describe('user mapping', () => {
  it('overrides names on top of a known model', () => {
    const map = effectiveInputs(
      'video',
      'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
      readInputMap(
        {
          'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': {
            prompt: 'text',
            image: 'first_frame',
          },
        },
        'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
      ),
    )
    const body = buildInputs(map, ctx())
    expect(body).toMatchObject({
      text: 'A flickering board',
      first_frame: 'data:image/png;base64,AAAA',
    })
    expect(body).not.toHaveProperty('prompt')
    expect(body).not.toHaveProperty('image_url')
  })

  it('builds a full mapping for an unknown model', () => {
    const map = effectiveInputs(
      'video',
      'acme/unknown',
      readInputMap(
        {
          'acme/unknown': {
            prompt: 'p',
            negativePrompt: 'np',
            duration: 'secs',
            durationAllowed: [4, 8],
            aspectRatio: 'ratio',
            image: 'img',
          },
        },
        'Acme/Unknown',
      ),
    )
    expect(buildInputs(map, ctx())).toEqual({
      p: 'A flickering board',
      np: 'text, watermark',
      secs: '8',
      img: 'data:image/png;base64,AAAA',
      ratio: '16:9',
    })
  })

  it('ignores names that are not plain identifiers', () => {
    const raw = { m: { prompt: 'a b', duration: '__proto__; drop', image: 'ok_name' } }
    expect(readInputMap(raw, 'm')).toEqual({ image: 'ok_name' })
    expect(readInputMap(raw, 'other')).toEqual({})
    expect(readInputMap('nope', 'm')).toEqual({})
    expect(readInputMap(null, 'm')).toEqual({})
  })
})

describe('clamps', () => {
  it('picks the nearest accepted duration', () => {
    expect(clampDuration(7, [5, 10])).toBe(5)
    expect(clampDuration(8, [5, 10])).toBe(10)
    expect(clampDuration(60, [5, 10])).toBe(10)
    expect(clampDuration(1, [5, 10])).toBe(5)
    expect(clampDuration(4.4, [])).toBe(4)
    expect(clampDuration(undefined, [5])).toBeUndefined()
    expect(clampDuration(0, [5])).toBeUndefined()
  })

  it('picks the nearest aspect ratio and image size', () => {
    expect(nearestAspect(['16:9', '9:16', '1:1'], 832, 1216)).toBe('9:16')
    expect(nearestAspect(['16:9', '9:16', '1:1'], 1000, 1000)).toBe('1:1')
    expect(nearestAspect(['16:9'], undefined, 5)).toBeUndefined()
    expect(nearestImageSize(1920, 1080)).toBe('landscape_16_9')
    expect(nearestImageSize(832, 1216)).toBe('portrait_4_3')
    expect(nearestImageSize(1024, 1024)).toBe('square_hd')
  })
})

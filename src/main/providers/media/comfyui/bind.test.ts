import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { WorkflowBinding } from '@shared/ipc/comfy'
import { WorkflowSidecar } from '../../../comfy/sidecar'
import type { ApiWorkflow } from '../../../comfy/workflow'
import type { MediaJob } from '../../types'
import { applyBindings, assertJobFits, framesFor, randomSeed, type BindContext } from './bind'

const workflow = {
  '1': { class_type: 'CLIPTextEncode', inputs: { text: 'literal', clip: ['4', 1] } },
  '2': { class_type: 'Latent', inputs: { width: 512, height: 512, length: 9 } },
  '3': { class_type: 'TTS', inputs: { text: '', voice: '', speaker: '', steps: 10 } },
}

function ctx(
  job: Partial<MediaJob> = {},
  sidecar: Partial<BindContext['sidecar']> = {},
): BindContext {
  return {
    job: {
      kind: 'image',
      injectId: 'I-1',
      outDir: '/tmp',
      brief: { paths: ['ai_image'], imagePrompt: 'a hangar' },
      ...job,
    },
    sidecar: { name: 'w', mediaType: 'image', description: '', bindings: [], ...sidecar },
    seed: 42,
  }
}

const bind = (target: [string, string], source: WorkflowBinding['source'], value?: unknown) =>
  ({
    target: [target[0], 'inputs', target[1]],
    source,
    ...(value !== undefined ? { value } : {}),
  }) as WorkflowBinding

describe('bindings', () => {
  it('appends the image style suffix and leaves unbound literals alone', () => {
    const out = applyBindings(
      workflow,
      [bind(['1', 'text'], 'imagePrompt'), bind(['2', 'width'], 'width')],
      ctx(
        { brief: { paths: ['ai_image'], imagePrompt: 'a hangar', imageStyle: 'press' } },
        { styles: { press: 'telephoto' } },
      ),
    )
    expect(out['1']!.inputs.text).toBe('a hangar, telephoto')
    expect(out['2']!.inputs.width).toBe(512) // job has no width
    expect(workflow['1'].inputs.text).toBe('literal') // input not mutated
  })

  it('converts durationSec to frames for frame-count inputs and clamps to the maximum', () => {
    const c = ctx(
      { kind: 'video', brief: { paths: ['ai_video'], durationSec: 3 } },
      { fps: 24, frameStep: 8, maxDurationSec: 2 },
    )
    const out = applyBindings(workflow, [bind(['2', 'length'], 'durationSec')], c)
    expect(out['2']!.inputs.length).toBe(49) // 2 s · 24 = 48 → 8·6 + 1
  })

  it('maps voice lines, literals and seeds', () => {
    const c = ctx({
      kind: 'audio',
      brief: {
        paths: ['tts'],
        voiceLines: [
          { speaker: 'Ops', voiceStyle: 'calm dispatcher', text: 'Copy that.' },
          { speaker: 'Tower', voiceStyle: '', text: 'Hold position.' },
        ],
      },
    })
    const out = applyBindings(
      workflow,
      [
        bind(['3', 'text'], 'text'),
        bind(['3', 'voice'], 'voiceStyle'),
        bind(['3', 'speaker'], 'speaker'),
        bind(['3', 'steps'], 'literal', 30),
        bind(['2', 'height'], 'seed'),
      ],
      c,
    )
    expect(out['3']!.inputs).toMatchObject({
      text: 'Copy that. Hold position.',
      voice: 'calm dispatcher',
      speaker: 'Ops',
      steps: 30,
    })
    expect(out['2']!.inputs.height).toBe(42)
  })

  it('rejects bindings to nodes the workflow lacks', () => {
    expect(() => applyBindings(workflow, [bind(['99', 'x'], 'seed')], ctx())).toThrow(
      /missing node/,
    )
  })

  it('refuses jobs missing what the workflow needs', () => {
    expect(() => assertJobFits([bind(['1', 'image'], 'inputImage')], ctx())).toThrow(/input image/)
    expect(() =>
      assertJobFits([bind(['1', 'text'], 'imagePrompt')], ctx({ brief: { paths: [] } })),
    ).toThrow(/no image prompt/)
    expect(() => assertJobFits([bind(['3', 'text'], 'text')], ctx())).toThrow(/no voice lines/)
  })

  it('computes 4n+1 / 8n+1 frame counts and safe random seeds', () => {
    expect(framesFor(5, 24, 4)).toBe(121)
    expect(framesFor(4, 24, 8)).toBe(97)
    expect(framesFor(0.01, 24, 4)).toBe(5)
    const s = randomSeed()
    expect(Number.isSafeInteger(s) && s >= 0).toBe(true)
  })
})

describe('lighting bindings (#162)', () => {
  const sampler = {
    '3': { class_type: 'KSampler', inputs: { denoise: 1, latent_image: ['5', 0] } },
  }
  const lightingBindings = [
    bind(['3', 'denoise'], 'lighting', { dark: 0.92 }),
    bind(['3', 'latent_image'], 'lighting', { dark: ['11', 0] }),
  ]
  const brief = (lighting?: 'normal' | 'dark') =>
    ctx({
      brief: { paths: ['ai_image'], imagePrompt: 'a concourse', ...(lighting ? { lighting } : {}) },
    })

  it('writes the value named for the brief lighting', () => {
    const out = applyBindings(sampler, lightingBindings, brief('dark'))
    expect(out['3']!.inputs).toEqual({ denoise: 0.92, latent_image: ['11', 0] })
  })

  it('keeps the workflow value for a lighting the map does not name (normal or unset)', () => {
    expect(applyBindings(sampler, lightingBindings, brief('normal'))['3']!.inputs).toEqual(
      sampler['3'].inputs,
    )
    expect(applyBindings(sampler, lightingBindings, brief())['3']!.inputs).toEqual(
      sampler['3'].inputs,
    )
    const withNormal = [bind(['3', 'denoise'], 'lighting', { normal: 0.8 })]
    expect(applyBindings(sampler, withNormal, brief())['3']!.inputs.denoise).toBe(0.8)
  })

  it('ignores a lighting binding whose value is not a map', () => {
    for (const value of [0.92, ['11', 0], 'dark', null]) {
      const out = applyBindings(sampler, [bind(['3', 'denoise'], 'lighting', value)], brief('dark'))
      expect(out['3']!.inputs.denoise).toBe(1)
    }
  })
})

describe('sdxl-photo dark lighting (#162)', () => {
  const dir = resolve('comfy/workflows')
  const workflow = JSON.parse(readFileSync(`${dir}/sdxl-photo.json`, 'utf8')) as ApiWorkflow
  const sidecar = WorkflowSidecar.parse(
    JSON.parse(readFileSync(`${dir}/sdxl-photo.bindings.json`, 'utf8')),
  )
  const render = (lighting?: 'dark' | 'screens-off') =>
    applyBindings(workflow, sidecar.bindings, {
      job: {
        kind: 'image',
        injectId: 'I-10',
        outDir: '/tmp',
        width: 1024,
        height: 768,
        brief: {
          paths: ['ai_image'],
          imagePrompt: 'a concourse',
          ...(lighting ? { lighting } : {}),
        },
      },
      sidecar,
      seed: 7,
    })

  it('samples a lit scene from the empty latent with the plain prompt, as before', () => {
    const out = render()
    expect(out['3']!.inputs).toMatchObject({
      latent_image: ['5', 0],
      positive: ['6', 0],
      denoise: 1,
    })
  })

  it('samples a dark scene from the dark start latent with the dark-ceiling area prompt', () => {
    const out = render('dark')
    expect(out['3']!.inputs).toMatchObject({
      latent_image: ['11', 0],
      positive: ['14', 0],
      denoise: 0.92,
    })
    // The dark start image follows the job size, so the latent matches the empty one.
    expect(out['10']!.inputs).toMatchObject({ width: 1024, height: 768 })
    expect(out['5']!.inputs).toMatchObject({ width: 1024, height: 768 })
    expect(out['14']!.inputs).toEqual({ conditioning_1: ['6', 0], conditioning_2: ['13', 0] })
  })

  it('saves the plain decode for lit and dark scenes', () => {
    expect(render()['9']!.inputs.images).toEqual(['8', 0])
    expect(render('dark')['9']!.inputs.images).toEqual(['8', 0])
    expect(render('dark')['3']!.inputs.negative).toEqual(['7', 0])
  })

  it('links only to nodes the workflow has', () => {
    for (const lighting of ['dark', 'screens-off'] as const) {
      const out = render(lighting)
      for (const node of Object.values(out))
        for (const value of Object.values(node.inputs))
          if (Array.isArray(value) && typeof value[0] === 'string')
            expect(out).toHaveProperty(value[0])
    }
  })
})

describe('sdxl-photo screens-off lighting (#356)', () => {
  const dir = resolve('comfy/workflows')
  const workflow = JSON.parse(readFileSync(`${dir}/sdxl-photo.json`, 'utf8')) as ApiWorkflow
  const sidecar = WorkflowSidecar.parse(
    JSON.parse(readFileSync(`${dir}/sdxl-photo.bindings.json`, 'utf8')),
  )
  const out = applyBindings(workflow, sidecar.bindings, {
    job: {
      kind: 'image',
      injectId: 'I-10',
      outDir: '/tmp',
      width: 1024,
      height: 768,
      brief: { paths: ['ai_image'], imagePrompt: 'a concourse', lighting: 'screens-off' },
    },
    sidecar,
    seed: 7,
  })

  it('keeps the lit start latent and adds unlit-ceiling area prompts on both sides', () => {
    expect(out['3']!.inputs).toMatchObject({
      latent_image: ['5', 0],
      denoise: 1,
      positive: ['17', 0],
      negative: ['20', 0],
    })
    expect(out['17']!.inputs).toEqual({ conditioning_1: ['6', 0], conditioning_2: ['16', 0] })
    expect(out['20']!.inputs).toEqual({ conditioning_1: ['7', 0], conditioning_2: ['19', 0] })
    expect(out['16']!.inputs).toMatchObject({ height: 0.4, y: 0 })
  })

  it('repaints the detected signs with the same seed and saves the composite', () => {
    expect(out['9']!.inputs.images).toEqual(['54', 0])
    expect(out['52']!.inputs).toMatchObject({
      seed: 7,
      denoise: 0.55,
      positive: ['17', 0],
      negative: ['20', 0],
      latent_image: ['51', 0],
    })
    // Only the masked signs change: the repaint goes back over the first decode.
    expect(out['54']!.inputs).toMatchObject({
      destination: ['8', 0],
      source: ['53', 0],
      mask: ['47', 0],
    })
  })

  it('builds the sign mask at the job size from stock mask nodes', () => {
    expect(out['41']!.inputs).toMatchObject({ width: 1024, height: 768 })
    expect(out['48']!.inputs).toMatchObject({ width: 1024, height: 768 })
    const classes = new Set(
      ['21', '24', '25', '28', '40', '42', '44', '45', '47', '49', '51'].map(
        (id) => out[id]!.class_type,
      ),
    )
    expect([...classes].sort()).toEqual([
      'GrowMask',
      'ImageCompositeMasked',
      'ImageToMask',
      'InvertMask',
      'MaskComposite',
      'Morphology',
      'SetLatentNoiseMask',
      'ThresholdMask',
    ])
  })
})

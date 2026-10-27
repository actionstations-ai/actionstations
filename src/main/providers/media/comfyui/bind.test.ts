import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { WorkflowBinding } from '@shared/ipc/comfy'
import { WorkflowSidecar } from '../../../comfy/sidecar'
import { withoutGroups, type ApiWorkflow } from '../../../comfy/workflow'
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

  it('renders the first pass exactly as a lit scene (people and room untouched)', () => {
    expect(out['3']!.inputs).toMatchObject({
      latent_image: ['5', 0],
      denoise: 1,
      positive: ['6', 0],
      negative: ['7', 0],
    })
  })

  it('repaints the detected signs with the same seed and saves the composite', () => {
    // Without the optional FLUX.2 klein edit, the image saved is the sign repaint (node 54).
    expect(withoutGroups(out, ['flux2-klein-edit'])['9']!.inputs.images).toEqual(['54', 0])
    expect(out['52']!.inputs).toMatchObject({
      seed: 7,
      denoise: 0.55,
      positive: ['6', 0],
      negative: ['7', 0],
      latent_image: ['51', 0],
    })
    // Only the masked signs change: the repaint goes back over the first decode.
    // The mask is the optional sign detector's (node 108); without it, the colour mask (47).
    for (const id of ['49', '51', '54']) {
      expect(out[id]!.inputs.mask).toEqual(['108', 0])
      expect(workflow[id]!._meta?.fallback).toEqual({ mask: ['47', 0] })
    }
    expect(out['54']!.inputs).toMatchObject({ destination: ['8', 0], source: ['53', 0] })
  })

  it('marks the Florence-2 sign detector optional and keeps people out of its mask', () => {
    const group = Object.entries(workflow).filter(([, n]) => n._meta?.optional === 'sign-detector')
    const classes = new Set(group.map(([, n]) => n.class_type))
    expect(classes.has('Florence2Run')).toBe(true)
    // Every node that runs Florence-2 or a custom loader is in the group.
    for (const n of Object.values(workflow))
      if (n.class_type.startsWith('Florence2')) expect(n._meta?.optional).toBe('sign-detector')
    // The final mask subtracts the grown people mask from the signs in the top band.
    expect(out['108']!.inputs).toMatchObject({
      operation: 'subtract',
      destination: ['106', 0],
      source: ['107', 0],
    })
    // Masks follow the job size.
    expect(out['61']!.inputs).toMatchObject({ width: 1024, height: 768 })
    expect(out['104']!.inputs).toMatchObject({ width: 1024, height: 768 })
    const runs = group.filter(([, n]) => n.class_type === 'Florence2Run').map(([, n]) => n.inputs)
    expect(runs).toHaveLength(16)
    expect(runs.every((r) => r.task === 'region_caption' && r.do_sample === false)).toBe(true)
  })

  it('grows the detector masks with Morphology, which also runs with tensors on the GPU', () => {
    // GrowMask converts its input to numpy and fails when ComfyUI keeps tensors on the GPU
    // (`--gpu-only`, the way to run Florence-2 on Apple Silicon's GPU), so the group avoids it.
    const group = Object.entries(out).filter(
      ([id]) => workflow[id]!._meta?.optional === 'sign-detector',
    )
    expect(group.some(([, n]) => n.class_type === 'GrowMask')).toBe(false)
    const dilate = (id: string) => {
      const toMask = out[id]!
      expect(toMask.class_type).toBe('ImageToMask')
      const morph = out[(toMask.inputs.image as [string, number])[0]]!
      expect(morph.class_type).toBe('Morphology')
      expect(morph.inputs.operation).toBe('dilate')
      const toImage = out[(morph.inputs.image as [string, number])[0]]!
      expect(toImage.class_type).toBe('MaskToImage')
      return { source: toImage.inputs.mask, kernel: morph.inputs.kernel_size }
    }
    // Signs (detected and colour-matched) grow 4 px; people grow 10 px before they are cut out.
    expect(dilate('103')).toEqual({ source: ['102', 0], kernel: 9 })
    expect(dilate('107')).toEqual({ source: ['101', 0], kernel: 21 })
  })

  it('builds the sign mask at the job size from stock mask nodes', () => {
    expect(out['41']!.inputs).toMatchObject({ width: 1024, height: 768 })
    expect(out['48']!.inputs).toMatchObject({ width: 1024, height: 768 })
    // Amber needs r - b > 0.55: lit skin highlights reach about 0.36 and must stay unmasked.
    expect(out['36']!.inputs).toMatchObject({ mask: ['35', 0], value: 0.55 })
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

describe('sdxl-photo screens-off FLUX.2 klein edit (#356)', () => {
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
        brief: {
          paths: ['ai_image'],
          imagePrompt: 'a concourse',
          ...(lighting ? { lighting } : {}),
        },
      },
      sidecar,
      seed: 7,
    })
  const out = render('screens-off')
  const group = Object.keys(workflow).filter(
    (id) => workflow[id]!._meta?.optional === 'flux2-klein-edit',
  )

  it('is an optional group that names the three FLUX.2 klein model files', () => {
    expect(group.length).toBeGreaterThan(30)
    const byClass = (cls: string) => group.map((id) => out[id]!).find((n) => n.class_type === cls)
    expect(byClass('UNETLoader')!.inputs.unet_name).toBe('flux-2-klein-4b.safetensors')
    expect(byClass('CLIPLoader')!.inputs).toMatchObject({
      clip_name: 'qwen_3_4b.safetensors',
      type: 'flux2',
    })
    expect(byClass('VAELoader')!.inputs.vae_name).toBe('flux2-vae.safetensors')
    // Every node that loads or runs FLUX.2 is in the group, so a server without it skips them.
    for (const n of Object.values(workflow))
      if (['UNETLoader', 'ReferenceLatent', 'Flux2Scheduler'].includes(n.class_type))
        expect(n._meta?.optional).toBe('flux2-klein-edit')
  })

  it('saves the edited image for screens-off and the sign repaint without the edit', () => {
    expect(out['9']!.inputs.images).toEqual(['166', 0])
    expect(workflow['9']!._meta?.fallback).toEqual({ images: ['54', 0] })
    // Without either optional group the render is the colour-mask repaint, as before.
    const plain = withoutGroups(out, ['flux2-klein-edit', 'sign-detector'])
    expect(plain['9']!.inputs.images).toEqual(['54', 0])
    for (const id of ['49', '51', '54']) expect(plain[id]!.inputs.mask).toEqual(['47', 0])
  })

  it('keeps lit and power-loss scenes on the plain decode', () => {
    expect(render()['9']!.inputs.images).toEqual(['8', 0])
    expect(render('dark')['9']!.inputs.images).toEqual(['8', 0])
  })

  it('edits the lit render at its own size with the job seed and the keep-in-place instruction', () => {
    expect(out['124']!.inputs.pixels).toEqual(['8', 0])
    expect(out['133']!.inputs.noise_seed).toBe(7)
    expect(out['131']!.inputs).toMatchObject({ steps: 4, width: ['123', 0], height: ['123', 1] })
    expect(out['132']!.inputs).toMatchObject({ width: ['123', 0], height: ['123', 1] })
    expect(out['129']!.inputs.cfg).toBe(1)
    // A shorter "switch everything off" wording deleted the boards instead of blacking them.
    const text = String(out['125']!.inputs.text)
    expect(text).toContain('Keep each one in exactly the same place and size')
    expect(text).toContain('solid glossy black')
    expect(text).toContain('including every person, face')
    // The edit comes back at the lit render's size before it is compared.
    expect(out['136']!.inputs).toMatchObject({
      image: ['135', 0],
      width: ['123', 0],
      height: ['123', 1],
    })
  })

  it('takes from the edit only boards it darkened, and keeps every other pixel', () => {
    // Darkening: lit minus edit per channel (MaskComposite clamps at 0, so brighter is 0).
    const channels: [string, string, string][] = [
      ['143', '137', '140'],
      ['144', '138', '141'],
      ['145', '139', '142'],
    ]
    for (const [d, lit, edit] of channels)
      expect(out[d]!.inputs).toMatchObject({
        operation: 'subtract',
        destination: [lit, 0],
        source: [edit, 0],
      })
    expect(out['148']!.inputs).toMatchObject({ mask: ['147', 0], value: 0.3 })
    // Open before close: specks from the redrawn crowd go before boards are filled.
    expect(out['150']!.inputs).toMatchObject({ image: ['149', 0], operation: 'open' })
    expect(out['151']!.inputs).toMatchObject({ image: ['150', 0], operation: 'close' })
    // Weaker darkening (board text, dim edges) counts only within 30 px of a board.
    expect(out['153']!.inputs.image).toEqual(['173', 0])
    expect(out['167']!.inputs).toMatchObject({ mask: ['147', 0], value: 0.15 })
    expect(out['168']!.inputs).toMatchObject({ operation: 'multiply', destination: ['153', 0] })
    // Only pixels the edit made darker are replaced.
    expect(out['155']!.inputs).toMatchObject({
      operation: 'multiply',
      destination: ['171', 0],
      source: ['154', 0],
    })
    expect(out['156']!.inputs).toMatchObject({
      destination: ['8', 0],
      source: ['136', 0],
      mask: ['155', 0],
    })
  })

  it('repaints lit signs the edit missed with the scene prompt and seed', () => {
    expect(out['160']!.inputs).toMatchObject({
      operation: 'subtract',
      destination: ['159', 0],
      source: ['155', 0],
    })
    expect(out['158']!.inputs).toMatchObject({ image: ['157', 0], operation: 'dilate' })
    expect(out['157']!.inputs.mask).toEqual(['46', 0])
    expect(out['164']!.inputs).toMatchObject({
      seed: 7,
      denoise: 0.55,
      model: ['4', 0],
      positive: ['6', 0],
      negative: ['7', 0],
      latent_image: ['163', 0],
    })
    expect(out['166']!.inputs).toMatchObject({
      destination: ['156', 0],
      source: ['165', 0],
      mask: ['160', 0],
    })
  })

  it('uses only nodes that run with tensors on the GPU and kernels MPS can index', () => {
    const nodes = group.map((id) => out[id]!)
    expect(nodes.some((n) => n.class_type === 'GrowMask')).toBe(false)
    // A 61 px Morphology kernel needs 64-bit indexing, which MPS lacks; 21 px is the largest used.
    for (const n of nodes)
      if (n.class_type === 'Morphology')
        expect(n.inputs.kernel_size as number).toBeLessThanOrEqual(21)
  })

  it('links only to nodes the workflow has', () => {
    for (const node of Object.values(out))
      for (const value of Object.values(node.inputs))
        if (Array.isArray(value) && typeof value[0] === 'string')
          expect(out).toHaveProperty(value[0])
  })
})

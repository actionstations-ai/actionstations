import { describe, expect, it } from 'vitest'
import type { WorkflowBinding } from '@shared/ipc/comfy'
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

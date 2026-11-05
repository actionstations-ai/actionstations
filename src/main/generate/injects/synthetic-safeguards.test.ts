// Synthetic media safeguards in generation and export (spec 0467 FR-6): a flagged inject refuses
// a prompt that names a real person before any provider call, flagged assets carry the mark, and
// exported file names carry the exercise marking.
import { describe, expect, it } from 'vitest'
import { Inject, MediaBrief } from '@shared/schemas'
import { SYNTHETIC_FILE_PREFIX } from '@shared/synthetic-media'
import { planMediaFiles } from '../../export/naming'
import { assertFictionalLikeness, type StepContext } from './media-assets'

const provenance = { provider: 'local-tts', createdAt: '2026-11-04T00:00:00.000Z' }

const inject = (over: Record<string, unknown> = {}) =>
  Inject.parse({ id: 'inj-1', mselRowId: 'I-04', type: 'voicemail', title: 'Voicemail', ...over })

const step = (i: ReturnType<typeof inject>, brief: unknown) =>
  ({ inject: i, brief: MediaBrief.parse(brief) }) as Pick<StepContext, 'inject' | 'brief'>

describe('prompt guard', () => {
  const real = {
    paths: ['tts'],
    voiceLines: [{ speaker: 'CFO', voiceStyle: 'sounds like Tim Cook', text: 'Please wire it.' }],
  }

  it('stops a flagged inject whose brief names a real person, with a way to fix it', () => {
    const s = step(inject({ syntheticMedia: true }), real)
    expect(() => assertFictionalLikeness(s)).toThrow(/fictional voice and face/)
    expect(() => assertFictionalLikeness(s)).toThrow(/Tim Cook/)
  })

  it('lets a flagged inject through when the brief describes a fictional person', () => {
    const s = step(inject({ syntheticMedia: true }), {
      paths: ['tts'],
      voiceLines: [
        {
          speaker: 'CFO',
          voiceStyle: 'woman in her forties, brisk, warm alto',
          text: 'Please wire it.',
        },
      ],
    })
    expect(() => assertFictionalLikeness(s)).not.toThrow()
  })

  it('leaves unflagged injects to the ordinary rules', () => {
    expect(() => assertFictionalLikeness(step(inject(), real))).not.toThrow()
  })
})

describe('export names', () => {
  const asset = (id: string, synthetic: boolean) => ({
    id,
    kind: 'audio',
    path: `scenarios/s/media/i/${id}.wav`,
    role: 'generated',
    ...(synthetic ? { synthetic: true } : {}),
    provenance,
  })

  it('marks synthetic files and their mp3 siblings, and only those', () => {
    const [flagged, plain] = planMediaFiles('3', [
      inject({ assets: [asset('a1', true)] }),
      inject({ id: 'inj-2', mselRowId: 'I-05', assets: [asset('a2', false)] }),
    ])
    expect(flagged!.fileName).toBe(`${SYNTHETIC_FILE_PREFIX}S3-I04-voicemail.wav`)
    expect(flagged!.mp3Name).toBe(`${SYNTHETIC_FILE_PREFIX}S3-I04-voicemail.mp3`)
    expect(plain!.fileName).toBe('S3-I05-voicemail.wav')
  })
})

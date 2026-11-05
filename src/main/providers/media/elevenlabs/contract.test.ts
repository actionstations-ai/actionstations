// Contract tests for the ElevenLabs adapter against hand-built responses in the documented
// shapes (no paid calls): POST /v1/text-to-speech/{voice_id}?output_format=pcm_44100 returns raw
// 16-bit PCM; GET /v1/voices returns { voices: [{ voice_id, name, description }] }; GET /v1/models
// returns an array with can_do_text_to_speech; errors are { detail: { status, message } }.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { chunkedResponse, stubFetch } from '../../text/test-fixtures'
import { wavDurationSec } from '../../text/openai-compatible/wav'
import type { MediaJob } from '../../types'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { adapter } = await import('./adapter')
const { ElevenLabsProvider } = await import('./provider')

afterEach(() => vi.unstubAllGlobals())

const KEY = 'xi-test-key-0000000000'
const config = (options: Record<string, unknown> = {}): ProviderConfig => ({
  id: 'eleven',
  kind: 'elevenlabs',
  label: 'ElevenLabs',
  options,
  enabled: true,
})
const provider = (options?: Record<string, unknown>, over: Partial<ProviderConfig> = {}) =>
  new ElevenLabsProvider({ ...config(options), ...over }, KEY)

/** `seconds` of 44.1 kHz mono PCM16 (a constant tone level so mixing is observable). */
function pcm(seconds: number, level = 1000, rate = 44100): Uint8Array {
  const samples = new Int16Array(Math.round(seconds * rate)).fill(level)
  return new Uint8Array(samples.buffer)
}
const audio = (bytes: Uint8Array) =>
  chunkedResponse(bytes, { contentType: 'application/octet-stream', chunkSize: 4096 })
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  chunkedResponse(JSON.stringify(body), { status, headers })
const apiError = (status: number, code: string, message: string, headers = {}) =>
  json({ detail: { status: code, message } }, status, headers)

const job = (lines: { speaker: string; text: string }[], extra: Partial<MediaJob['brief']> = {}) =>
  ({
    kind: 'audio',
    injectId: 'I-01',
    brief: {
      paths: ['tts'],
      voiceLines: lines.map((l) => ({ ...l, voiceStyle: '' })),
      ...extra,
    },
    outDir: mkdtempSync(join(tmpdir(), 'ttx-eleven-')),
  }) satisfies MediaJob

describe('ElevenLabs adapter', () => {
  it('is discovered as the elevenlabs kind and serves audio', () => {
    expect(adapter.kind).toBe('elevenlabs')
    const p = adapter.createMedia?.(config(), KEY)
    expect(p).toBeInstanceOf(ElevenLabsProvider)
    expect([...p!.capabilities()]).toEqual(['audio'])
  })

  it('wraps the PCM answer as a WAV and sends the documented request', async () => {
    const calls = stubFetch([audio(pcm(1))])
    const j = job([{ speaker: 'PIO', text: 'Flights are delayed.' }])
    const [out] = await provider(
      { voice: 'v-rachel' },
      { defaultModel: 'eleven_flash_v2_5' },
    ).generate(j)
    const req = calls[0]!
    expect(req.url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/v-rachel?output_format=pcm_44100',
    )
    expect(req.method).toBe('POST')
    expect(req.headers['xi-api-key']).toBe(KEY)
    expect(req.body).toEqual({ text: 'Flights are delayed.', model_id: 'eleven_flash_v2_5' })
    expect(out!.mimeType).toBe('audio/wav')
    expect(out!.durationSec).toBeCloseTo(1, 1)
    expect(wavDurationSec(readFileSync(out!.filePath))).toBeCloseTo(1, 1)
    expect(out!.provenance).toMatchObject({ provider: 'eleven', model: 'eleven_flash_v2_5' })
  })

  it('uses eleven_multilingual_v2 by default and the routed model over the default', async () => {
    const calls = stubFetch([audio(pcm(0.2)), audio(pcm(0.2))])
    const p = provider({ voice: 'v' }, { defaultModel: 'eleven_flash_v2_5' })
    await p.generate(job([{ speaker: 'A', text: 'one' }]))
    await p.generate({ ...job([{ speaker: 'A', text: 'two' }]), model: 'eleven_v3' })
    expect((calls[0]!.body as { model_id: string }).model_id).toBe('eleven_flash_v2_5')
    expect((calls[1]!.body as { model_id: string }).model_id).toBe('eleven_v3')
    stubFetch([audio(pcm(0.2))])
    const calls2 = stubFetch([audio(pcm(0.2))])
    await provider({ voice: 'v' }).generate(job([{ speaker: 'A', text: 'x' }]))
    expect((calls2[0]!.body as { model_id: string }).model_id).toBe('eleven_multilingual_v2')
  })

  it('voices each speaker in turn with their own voice and joins the clips', async () => {
    const calls = stubFetch([audio(pcm(1)), audio(pcm(0.5)), audio(pcm(1))])
    const [out] = await provider({
      voices: { Tower: 'v-adam', PIO: 'v-rachel' },
      voice: 'v-default',
    }).generate(
      job([
        { speaker: 'Tower', text: 'Hold position.' },
        { speaker: 'PIO', text: 'We are aware.' },
        { speaker: 'Caller', text: 'Is the airport closed?' },
      ]),
    )
    expect(calls.map((c) => c.url.split('/v1/text-to-speech/')[1]!.split('?')[0])).toEqual([
      'v-adam',
      'v-rachel',
      'v-default',
    ])
    // 1 + 0.5 + 1 seconds plus two 0.35 s gaps, as the existing speech output is joined.
    expect(out!.durationSec).toBeCloseTo(3.2, 1)
    expect(out!.provenance.prompt).toContain('PIO: We are aware.')
  })

  it('asks for a voice instead of guessing when a speaker has none', async () => {
    stubFetch([])
    await expect(provider().generate(job([{ speaker: 'Tower', text: 'Hi' }]))).rejects.toThrow(
      /No ElevenLabs voice is chosen for Tower/,
    )
  })

  it('uses the 24 kHz format when the plan needs it', async () => {
    const calls = stubFetch([audio(pcm(0.5, 1000, 24000))])
    const [out] = await provider({ voice: 'v', sampleRate: 24000 }).generate(
      job([{ speaker: 'A', text: 'x' }]),
    )
    expect(calls[0]!.url).toContain('output_format=pcm_24000')
    expect(out!.durationSec).toBeCloseTo(0.5, 1)
  })

  it('lays a sound effect under the voice only when switched on and the brief has a note', async () => {
    const note = { soundNote: 'crowd murmur, PA chime' }
    const off = stubFetch([audio(pcm(1))])
    await provider({ voice: 'v' }).generate(job([{ speaker: 'A', text: 'x' }], note))
    expect(off).toHaveLength(1)

    const noNote = stubFetch([audio(pcm(1))])
    await provider({ voice: 'v', soundEffects: true }).generate(job([{ speaker: 'A', text: 'x' }]))
    expect(noNote).toHaveLength(1)

    const on = stubFetch([audio(pcm(1, 0)), audio(pcm(2, 10000))])
    const [out] = await provider({ voice: 'v', soundEffects: true }).generate(
      job([{ speaker: 'A', text: 'x' }], note),
    )
    expect(on[1]!.url).toBe('https://api.elevenlabs.io/v1/sound-generation?output_format=pcm_44100')
    expect(on[1]!.body).toEqual({ text: 'crowd murmur, PA chime', duration_seconds: 1 })
    expect(out!.durationSec).toBeCloseTo(1, 1)
    expect(out!.provenance.model).toBe('eleven_multilingual_v2 + sound effects')
    // The silent voice now carries the effect at a lower level (10000 * 0.3).
    const bytes = readFileSync(out!.filePath)
    const sample = new DataView(bytes.buffer, bytes.byteOffset).getInt16(44 + 2000, true)
    expect(sample).toBe(3000)
  })

  it('lists the account voices and checks the key with that free call', async () => {
    const body = {
      voices: [
        { voice_id: 'v-rachel', name: 'Rachel', description: 'Calm', category: 'premade' },
        { voice_id: 'v-adam', name: 'Adam', description: null, category: 'premade' },
      ],
    }
    const calls = stubFetch([json(body), json(body)])
    expect(await provider().listVoices()).toEqual([
      { id: 'v-rachel', label: 'Rachel', description: 'Calm' },
      { id: 'v-adam', label: 'Adam' },
    ])
    const health = await provider().health()
    expect(health).toMatchObject({ ok: true, message: '2 voices' })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://api.elevenlabs.io/v1/voices',
      'GET https://api.elevenlabs.io/v1/voices',
    ])
    expect(calls[0]!.headers['xi-api-key']).toBe(KEY)
  })

  it('lists only the models that can speak', async () => {
    stubFetch([
      json([
        {
          model_id: 'eleven_multilingual_v2',
          name: 'Multilingual v2',
          can_do_text_to_speech: true,
        },
        { model_id: 'eleven_english_sts_v2', name: 'English STS', can_do_text_to_speech: false },
      ]),
    ])
    expect(await provider().listModels()).toEqual([
      { id: 'eleven_multilingual_v2', label: 'Multilingual v2', kind: 'speech' },
    ])
  })

  it('says a rejected key in plain words, in the health check and when speaking', async () => {
    const invalid = () => apiError(401, 'invalid_api_key', 'Invalid API key')
    stubFetch([invalid, invalid])
    expect(await provider().health()).toMatchObject({
      ok: false,
      message: 'ElevenLabs rejected the API key. Check the key in Providers.',
    })
    await expect(
      provider({ voice: 'v' }).generate(job([{ speaker: 'A', text: 'x' }])),
    ).rejects.toThrow('ElevenLabs rejected the API key. Check the key in Providers.')
  })

  it('reports exhausted credits, not a bad key, for quota_exceeded', async () => {
    stubFetch([apiError(401, 'quota_exceeded', 'You have 0 credits remaining')])
    await expect(
      provider({ voice: 'v' }).generate(job([{ speaker: 'A', text: 'x' }])),
    ).rejects.toThrow(/credits are used up/)
  })

  it('reports an unknown voice, a content refusal and rate limiting', async () => {
    stubFetch([apiError(404, 'voice_not_found', 'A voice with the voice_id v was not found.')])
    await expect(
      provider({ voice: 'v' }).generate(job([{ speaker: 'Tower', text: 'x' }])),
    ).rejects.toThrow(
      'ElevenLabs does not know the voice chosen for Tower. Pick another in Voices.',
    )
    stubFetch([apiError(400, 'content_against_policy', 'Text violates the usage policy')])
    await expect(
      provider({ voice: 'v' }).generate(job([{ speaker: 'A', text: 'x' }])),
    ).rejects.toThrow(/breaks its content rules/)
    const limited = () =>
      apiError(429, 'too_many_concurrent_requests', 'Too many', { 'retry-after': '0' })
    stubFetch([limited, limited, limited])
    await expect(
      provider({ voice: 'v' }).generate(job([{ speaker: 'A', text: 'x' }])),
    ).rejects.toThrow(/rate limiting/)
  })

  it('never puts the key in an error', async () => {
    stubFetch([
      apiError(500, 'internal', `boom ${KEY}`),
      apiError(500, 'internal', `boom ${KEY}`),
      apiError(500, 'internal', `boom ${KEY}`),
    ])
    const err = await provider({ voice: 'v' })
      .generate(job([{ speaker: 'A', text: 'x' }]))
      .catch((e: Error) => e)
    expect((err as Error).message).not.toContain(KEY)
  })

  it('refuses audio over the 50 MB limit', async () => {
    const big = new Uint8Array(51 * 1024 * 1024)
    stubFetch([audio(big)])
    await expect(
      provider({ voice: 'v' }).generate(job([{ speaker: 'A', text: 'x' }])),
    ).rejects.toThrow(/more than 50 MB/)
  })
})

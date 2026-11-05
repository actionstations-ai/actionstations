// The OpenAI-compatible speech adapter uses the model routed to the Audio task when the job
// carries one, and its own model setting otherwise.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { encodeWav } from '../../media/audio-fx/wav'
import type { MediaJob } from '../../types'
import { OpenAiCompatibleSpeechProvider } from './speech'

const config = {
  id: 'speech',
  label: 'Speech',
  kind: 'openai-compatible',
  enabled: true,
  baseUrl: 'http://127.0.0.1:1234/v1',
  defaultModel: 'default-tts',
  options: {},
} as unknown as ProviderConfig

const dirs: string[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function modelSent(job: Partial<MediaJob>): Promise<unknown> {
  const wav = encodeWav({ samples: new Float32Array(2400), sampleRate: 24000 })
  const bodies: Record<string, unknown>[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/audio/speech'))
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return new Response(String(url).endsWith('/models') ? '{"data":[]}' : wav, {
        status: 200,
        headers: { 'content-type': 'audio/wav' },
      })
    }),
  )
  const outDir = mkdtempSync(join(tmpdir(), 'speech-test-'))
  dirs.push(outDir)
  await new OpenAiCompatibleSpeechProvider(config, undefined).generate({
    kind: 'audio',
    injectId: 'i1',
    brief: { paths: ['tts'], voiceLines: [{ speaker: 'A', voiceStyle: '', text: 'Hello.' }] },
    outDir,
    ...job,
  })
  return bodies[0]?.model
}

describe('OpenAiCompatibleSpeechProvider model', () => {
  it('uses the routed model when the job has one', async () => {
    expect(await modelSent({ model: 'routed-tts' })).toBe('routed-tts')
  })

  it('falls back to the provider default without one', async () => {
    expect(await modelSent({})).toBe('default-tts')
  })
})

describe('OpenAiCompatibleSpeechProvider on a hosted service', () => {
  const hosted = {
    ...config,
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-chat',
    options: { preset: 'openai', ttsModel: 'tts-model', voices: { A: 'alloy' } },
  } as unknown as ProviderConfig

  async function bodySent(over: Partial<MediaJob> = {}): Promise<Record<string, unknown>> {
    const wav = encodeWav({ samples: new Float32Array(2400), sampleRate: 24000 })
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return new Response(wav, { status: 200, headers: { 'content-type': 'audio/wav' } })
      }),
    )
    const outDir = mkdtempSync(join(tmpdir(), 'speech-test-'))
    dirs.push(outDir)
    await new OpenAiCompatibleSpeechProvider(hosted, 'sk-test-0000000000').generate({
      kind: 'audio',
      injectId: 'i1',
      brief: { paths: ['tts'], voiceLines: [{ speaker: 'A', voiceStyle: 'calm', text: 'Hello.' }] },
      outDir,
      ...over,
    })
    return bodies[0]!
  }

  it('speaks with options.ttsModel, not the chat model', async () => {
    expect((await bodySent()).model).toBe('tts-model')
  })

  it('lets the routed audio model win over options.ttsModel', async () => {
    expect((await bodySent({ model: 'routed-tts' })).model).toBe('routed-tts')
  })

  it('sends the documented instructions field only, the per-speaker voice, and wav', async () => {
    const body = await bodySent()
    expect(body).toMatchObject({ voice: 'alloy', instructions: 'calm', response_format: 'wav' })
    expect(body).not.toHaveProperty('instruct')
  })
})

describe('OpenAiCompatibleSpeechProvider voices', () => {
  it("lists OpenAI's fixed presets for the hosted service only", async () => {
    const hosted = { ...config, baseUrl: 'https://api.openai.com/v1' } as ProviderConfig
    const voices = await new OpenAiCompatibleSpeechProvider(hosted, 'sk-test').listVoices()
    expect(voices.map((v) => v.id)).toEqual([
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'fable',
      'nova',
      'onyx',
      'sage',
      'shimmer',
      'verse',
      'marin',
      'cedar',
    ])
    expect(voices.find((v) => v.id === 'marin')).toMatchObject({ label: 'Marin' })
    expect(await new OpenAiCompatibleSpeechProvider(config, undefined).listVoices()).toEqual([])
  })
})

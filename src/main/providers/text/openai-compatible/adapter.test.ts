// Contract test: OpenAI-compatible adapter against responses recorded from LM Studio
// (tests/fixtures/providers/lmstudio-*.json, see record.mjs) plus hand-built edge cases.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import type { JsonSchemaSpec } from '../../types'
import {
  chunkedResponse,
  fixtureResponse,
  loadFixture,
  openAiSse,
  stubFetch,
} from '../test-fixtures'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { adapter } = await import('./adapter')
const { OpenAiCompatibleTextProvider, apiBase } = await import('./chat')
const { clearJsonModeCache } = await import('./json-mode')
const { silentWav, wavDurationSec } = await import('./wav')

beforeAll(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-oai-'))
})
beforeEach(() => clearJsonModeCache())
afterEach(() => vi.unstubAllGlobals())

type Body = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const config = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: 'lmstudio',
  kind: 'openai-compatible',
  label: 'LM Studio',
  baseUrl: 'http://127.0.0.1:1234/v1',
  defaultModel: 'qwen3-30b-a3b-2507',
  options: {},
  enabled: true,
  ...over,
})
const provider = (over?: Partial<ProviderConfig>, key?: string) =>
  new OpenAiCompatibleTextProvider(config(over), key)

/** The schema record.mjs used for the recorded structured-output fixtures. */
const MINI: JsonSchemaSpec = {
  name: 'MiniMsel',
  schema: {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            time: { type: 'string' },
            wallClock: { type: 'string' },
            purposeTag: {
              type: 'string',
              enum: ['STARTEX', 'CORE_NARRATIVE', 'PRESSURE', 'ENDEX'],
            },
            event: { type: 'string' },
          },
          required: ['id', 'time', 'purposeTag', 'event'],
          additionalProperties: false,
        },
      },
    },
    required: ['rows'],
    additionalProperties: false,
  },
}
const ask = (json?: JsonSchemaSpec) => ({
  messages: [{ role: 'user' as const, content: 'Two rows.' }],
  json,
})

describe('OpenAI-compatible chat', () => {
  it('normalises base URLs with and without /v1', () => {
    expect(apiBase('http://127.0.0.1:1234/v1/')).toBe('http://127.0.0.1:1234/v1')
    expect(apiBase('http://127.0.0.1:8765')).toBe('http://127.0.0.1:8765/v1')
    expect(apiBase('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/api/v1')
  })

  it('streams recorded LM Studio tokens in order with usage', async () => {
    const fx = loadFixture('lmstudio-chat-stream')
    const calls = stubFetch([fixtureResponse(fx, 61)])
    const tokens: string[] = []
    const res = await provider().chat({ system: 'Be brief.', ...ask() }, (t) => tokens.push(t))
    expect(tokens.join('')).toBe(res.text)
    expect(tokens.length).toBeGreaterThan(5)
    expect(res.text).toMatch(/tabletop exercise/i)
    expect(res.usage).toEqual({ inputTokens: 18, outputTokens: 31 })
    expect(res.finishReason).toBe('stop')
    expect(res.costUsd).toBe(0)
    const body = calls[0]!.body as Body
    expect(calls[0]!.url).toBe('http://127.0.0.1:1234/v1/chat/completions')
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Be brief.' })
    expect(body.stream_options).toEqual({ include_usage: true })
    expect(calls[0]!.headers.authorization).toBeUndefined()
  })

  it('sends options.seed as seed when it is an integer, and nothing otherwise (#434)', async () => {
    const calls = stubFetch([
      fixtureResponse('lmstudio-chat-stream'),
      fixtureResponse('lmstudio-chat-stream'),
      fixtureResponse('lmstudio-chat-stream'),
    ])
    await provider({ options: { seed: 23 } }).chat(ask())
    await provider({ options: { seed: 2.5 } }).chat(ask())
    await provider().chat(ask())
    expect((calls[0]!.body as Body).seed).toBe(23)
    expect(calls[1]!.body as Body).not.toHaveProperty('seed')
    expect(calls[2]!.body as Body).not.toHaveProperty('seed')
  })

  it('sends a Bearer key only when one is stored', async () => {
    const calls = stubFetch([fixtureResponse('lmstudio-chat-stream')])
    await provider({ baseUrl: 'https://openrouter.ai/api/v1' }, 'sk-or-v1-abcdefabcdef').chat(ask())
    expect(calls[0]!.headers.authorization).toBe('Bearer sk-or-v1-abcdefabcdef')
  })

  it('uses strict json_schema first and parses the recorded result', async () => {
    const calls = stubFetch([fixtureResponse('lmstudio-json-schema-stream')])
    const res = await provider().chat(ask(MINI))
    expect(res.structuredVia).toBe('json_schema')
    expect((res.json as Body).rows).toHaveLength(2)
    const rf = (calls[0]!.body as Body).response_format
    expect(rf.type).toBe('json_schema')
    expect(rf.json_schema.strict).toBe(true)
    expect(rf.json_schema.schema.properties.rows.items.required).toContain('wallClock')
  })

  it('falls back json_schema → json_object → prompt and remembers the working mode', async () => {
    const reject = () =>
      new Response("{\"error\":\"'response_format.type' must be 'json_schema' or 'text'\"}", {
        status: 400,
      })
    const answer = openAiSse([
      {
        model: 'm',
        choices: [
          {
            index: 0,
            delta: {
              content:
                'Sure:\n```json\n{"rows":[{"id":"START","time":"T+0","purposeTag":"STARTEX","event":"go","wallClock":null}]}\n```',
            },
          },
        ],
      },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    ])
    const calls = stubFetch([
      reject,
      fixtureResponse('lmstudio-json-object-400'),
      () => chunkedResponse(answer, { contentType: 'text/event-stream' }),
      () => chunkedResponse(answer, { contentType: 'text/event-stream' }),
    ])
    const p = provider()
    const first = await p.chat(ask(MINI))
    expect(calls.map((c) => (c.body as Body).response_format?.type)).toEqual([
      'json_schema',
      'json_object',
      undefined,
    ])
    expect(first.structuredVia).toBe('prompt')
    expect(first.json).toEqual({
      rows: [{ id: 'START', time: 'T+0', purposeTag: 'STARTEX', event: 'go' }],
    })
    expect((calls[2]!.body as Body).messages[0].content).toContain('Respond with JSON only')

    const second = await p.chat(ask(MINI))
    expect(calls).toHaveLength(4)
    expect((calls[3]!.body as Body).response_format).toBeUndefined()
    expect(second.structuredVia).toBe('prompt')
  })

  it('starts reasoning models (gpt-oss) from json_object, unless jsonMode says otherwise (#81)', async () => {
    const answer = () =>
      chunkedResponse(
        openAiSse([
          {
            model: 'gpt-oss-20b',
            choices: [
              {
                index: 0,
                delta: {
                  content:
                    '{"rows":[{"id":"START","time":"T+0","purposeTag":"STARTEX","event":"go"},{"id":"I-01","time":"T+5","purposeTag":"PRESSURE","event":"x"}]}',
                },
              },
            ],
          },
          { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        ]),
        { contentType: 'text/event-stream' },
      )
    const calls = stubFetch([answer, answer, answer])
    const res = await provider({ defaultModel: 'openai/gpt-oss-20b' }).chat(ask(MINI))
    expect(res.structuredVia).toBe('json_object')
    expect((res.json as Body).rows).toHaveLength(2)
    expect((calls[0]!.body as Body).response_format).toEqual({ type: 'json_object' })
    expect((calls[0]!.body as Body).messages[0].content).toContain('Respond with JSON only')
    // Other models keep strict json_schema first; an explicit jsonMode wins for gpt-oss too.
    await provider({ defaultModel: 'qwen3-30b-a3b-2507' }).chat(ask(MINI))
    expect((calls[1]!.body as Body).response_format.type).toBe('json_schema')
    await provider({ defaultModel: 'gpt-oss-120b', options: { jsonMode: 'json_schema' } }).chat(
      ask(MINI),
    )
    expect((calls[2]!.body as Body).response_format.type).toBe('json_schema')
  })

  it('does not downgrade on errors unrelated to the response format', async () => {
    stubFetch([new Response('{"error":"Model unloaded"}', { status: 404 })])
    await expect(provider().chat(ask(MINI))).rejects.toMatchObject({
      message: expect.stringContaining('HTTP 404'),
    })
  })

  it('ignores gpt-oss reasoning deltas (recorded) when parsing and streaming', async () => {
    stubFetch([fixtureResponse('lmstudio-reasoning-stream')])
    const tokens: string[] = []
    const res = await provider({
      defaultModel: 'gpt-oss-20b',
      options: { jsonMode: 'prompt' },
    }).chat(ask(MINI), (t) => tokens.push(t))
    expect(tokens.join('')).not.toContain('Need JSON')
    expect((res.json as Body).rows[1].purposeTag).toBe('PRESSURE')
    expect(res.usage.outputTokens).toBe(115)
  })

  it('strips <think> blocks before parsing and from the token stream', async () => {
    const sse = openAiSse([
      { choices: [{ index: 0, delta: { content: '<think>\nplan the rows' } }] },
      {
        choices: [{ index: 0, delta: { content: '</think>\n{"rows":[{"id":"I-1","time":"T+5",' } }],
      },
      {
        choices: [
          {
            index: 0,
            delta: { content: '"purposeTag":"PRESSURE","event":"x"}]}' },
            finish_reason: 'stop',
          },
        ],
      },
    ])
    stubFetch([chunkedResponse(sse, { contentType: 'text/event-stream', chunkSize: 9 })])
    const tokens: string[] = []
    const res = await provider().chat(ask(MINI), (t) => tokens.push(t))
    expect(res.text.startsWith('{"rows"')).toBe(true)
    expect(tokens.join('')).not.toContain('plan the rows')
    expect((res.json as Body).rows[0].id).toBe('I-1')
  })

  it('aborts a streaming request', async () => {
    const ctrl = new AbortController()
    stubFetch([fixtureResponse('lmstudio-chat-stream', 31)])
    const run = provider().chat({ ...ask(), signal: ctrl.signal }, () => ctrl.abort())
    await expect(run).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('lists recorded models and reports health', async () => {
    stubFetch([fixtureResponse('lmstudio-models'), fixtureResponse('lmstudio-models')])
    const models = await provider().listModels()
    expect(models.find((m) => m.id === 'qwen3-30b-a3b-2507')?.kind).toBe('chat')
    expect(models.find((m) => m.id.includes('nomic'))?.kind).toBe('embedding')
    expect(await provider().health()).toMatchObject({ ok: true })
  })

  it('reports an unreachable server as unhealthy', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed')
    })
    const h = await provider({ options: {} }).health()
    expect(h.ok).toBe(false)
  })
})

describe('OpenAI-compatible embeddings', () => {
  it('returns vectors in input order and discovers dimensions', async () => {
    const calls = stubFetch([fixtureResponse('lmstudio-embeddings')])
    const e = adapter.createEmbedding!(config(), undefined, 'text-embedding-nomic-embed-text-v1.5')
    expect(e.dims).toBe(0)
    const vecs = await e.embed(['airport emergency plan', 'baggage handling system outage'])
    expect(vecs).toHaveLength(2)
    expect(vecs[0]).toBeInstanceOf(Float32Array)
    expect(e.dims).toBe(768)
    expect(calls[0]!.url).toBe('http://127.0.0.1:1234/v1/embeddings')
  })

  it('rejects a response with the wrong number of vectors', async () => {
    stubFetch([new Response('{"data":[{"index":0,"embedding":[0.1]}]}')])
    const e = adapter.createEmbedding!(config(), undefined, 'm')
    await expect(e.embed(['a', 'b'])).rejects.toMatchObject({ code: 'PROVIDER' })
  })
})

describe('OpenAI-compatible speech (mlx-audio)', () => {
  const ttsConfig = config({
    id: 'mlx-audio',
    baseUrl: 'http://127.0.0.1:8765',
    defaultModel: 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16',
    options: { voices: { Caller: 'af_heart' } },
  })

  it('voices each line, joins the clips and writes one WAV', async () => {
    const calls = stubFetch(
      () => new Response(silentWav(0.5), { headers: { 'content-type': 'audio/wav' } }),
    )
    const media = adapter.createMedia!(ttsConfig, undefined)
    expect([...media.capabilities()]).toEqual(['audio'])
    const outDir = mkdtempSync(join(tmpdir(), 'ttx-tts-'))
    const progress: number[] = []
    const [out] = await media.generate(
      {
        kind: 'audio',
        injectId: 'inj-07',
        outDir,
        brief: {
          paths: ['tts'],
          voiceLines: [
            {
              speaker: 'Caller',
              voiceStyle: 'panicked middle-aged man, airport ramp noise',
              text: 'The baggage belts stopped!',
            },
            { speaker: 'Dispatcher', voiceStyle: '', text: 'Stay on the line.' },
          ],
        },
      },
      (p) => progress.push(p.progress),
    )
    expect(calls).toHaveLength(2)
    expect(calls[0]!.url).toBe('http://127.0.0.1:8765/v1/audio/speech')
    expect(calls[0]!.body).toEqual({
      model: 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16',
      input: 'The baggage belts stopped!',
      response_format: 'wav',
      voice: 'af_heart',
      instructions: 'panicked middle-aged man, airport ramp noise',
      instruct: 'panicked middle-aged man, airport ramp noise',
    })
    // VoiceDesign models need a description: an empty voiceStyle gets a neutral one.
    expect((calls[1]!.body as Body).instruct).toBe('A clear, neutral adult voice')
    expect(out).toMatchObject({ kind: 'audio', mimeType: 'audio/wav', durationSec: 1.35 })
    expect(out!.filePath.startsWith(outDir)).toBe(true)
    expect(wavDurationSec(readFileSync(out!.filePath))).toBeCloseTo(1.35, 2)
    expect(out!.provenance).toMatchObject({
      provider: 'mlx-audio',
      prompt: expect.stringContaining('Dispatcher: Stay on the line.'),
    })
    expect(progress.at(-1)).toBe(1)
  })

  it('keeps one voice per speaker: later lines are cloned from the first clip (#108)', async () => {
    const models = () =>
      new Response(
        JSON.stringify({
          data: [{ id: 'mlx-community/VoxCPM2-8bit' }, { id: ttsConfig.defaultModel }],
        }),
        { headers: { 'content-type': 'application/json' } },
      )
    const calls = stubFetch((call) =>
      call.url.endsWith('/models') ? models() : new Response(silentWav(0.4)),
    )
    const media = adapter.createMedia!(ttsConfig, undefined)
    const outDir = mkdtempSync(join(tmpdir(), 'ttx-tts-'))
    const [out] = await media.generate({
      kind: 'audio',
      injectId: 'inj-05b',
      outDir,
      brief: {
        paths: ['tts'],
        voiceLines: [
          { speaker: 'Parking 3', voiceStyle: 'tired male supervisor', text: 'Ops, Parking 3.' },
          { speaker: 'Ops', voiceStyle: 'calm female dispatcher', text: 'Go ahead.' },
          {
            speaker: 'Parking 3',
            voiceStyle: 'tired male supervisor',
            text: 'Alarm on level three.',
          },
          { speaker: 'Ops', voiceStyle: 'calm female dispatcher', text: 'Copy, fire is en route.' },
        ],
      },
    })
    const speech = calls.filter((c) => c.url.endsWith('/audio/speech')).map((c) => c.body as Body)
    expect(calls.filter((c) => c.url.endsWith('/models'))).toHaveLength(1)
    expect(speech).toHaveLength(4)
    // First line of each speaker: the configured VoiceDesign model with the description.
    expect(speech[0]).toMatchObject({
      model: ttsConfig.defaultModel,
      instruct: 'tired male supervisor',
    })
    expect(speech[0]).not.toHaveProperty('ref_audio')
    expect(speech[1]).toMatchObject({
      model: ttsConfig.defaultModel,
      instruct: 'calm female dispatcher',
    })
    // Later lines: the VoxCPM clone model with the speaker's first clip and text, no description.
    expect(speech[2]).toEqual({
      model: 'mlx-community/VoxCPM2-8bit',
      input: 'Alarm on level three.',
      response_format: 'wav',
      ref_audio: join(outDir, 'inj-05b-ref-0.wav'),
      ref_text: 'Ops, Parking 3.',
    })
    expect(speech[3]).toMatchObject({
      ref_audio: join(outDir, 'inj-05b-ref-1.wav'),
      ref_text: 'Go ahead.',
    })
    expect(speech[3]).not.toHaveProperty('instruct')
    // Reference clips are removed; only the joined WAV remains.
    expect(readdirSync(outDir)).toEqual([out!.filePath.split('/').pop()])
    expect(out!.provenance.model).toBe(
      `${ttsConfig.defaultModel} + mlx-community/VoxCPM2-8bit (clone)`,
    )
    expect(out!.durationSec).toBeCloseTo(4 * 0.4 + 3 * 0.35, 2)
  })

  it('a VoxCPM model clones with itself; one line per speaker or voiceClone off voices each line alone', async () => {
    const calls = stubFetch(() => new Response(silentWav(0.2)))
    const vox = { ...ttsConfig, defaultModel: 'mlx-community/VoxCPM2-8bit' }
    const lines = [
      { speaker: 'PA', voiceStyle: 'synthetic PA voice', text: 'Attention please.' },
      { speaker: 'PA', voiceStyle: 'synthetic PA voice', text: 'Flight 666 is boarding.' },
    ]
    const outDir = mkdtempSync(join(tmpdir(), 'ttx-tts-'))
    await adapter.createMedia!(vox, undefined).generate({
      kind: 'audio',
      injectId: 'i',
      outDir,
      brief: { paths: ['tts'], voiceLines: lines },
    })
    expect(calls.map((c) => c.url.endsWith('/models'))).toEqual([false, false])
    expect(calls[1]!.body).toMatchObject({ model: vox.defaultModel, ref_text: 'Attention please.' })
    expect(calls[1]!.body).not.toHaveProperty('instruct')

    calls.length = 0
    await adapter.createMedia!({ ...vox, options: { voiceClone: 'off' } }, undefined).generate({
      kind: 'audio',
      injectId: 'i',
      outDir,
      brief: { paths: ['tts'], voiceLines: lines },
    })
    expect(calls.map((c) => (c.body as Body).ref_audio)).toEqual([undefined, undefined])

    calls.length = 0
    await adapter.createMedia!(ttsConfig, undefined).generate({
      kind: 'audio',
      injectId: 'i',
      outDir,
      brief: { paths: ['tts'], voiceLines: [lines[0]!, { ...lines[1]!, speaker: 'Agent' }] },
    })
    expect(calls.some((c) => c.url.endsWith('/models'))).toBe(false)
    expect(calls.map((c) => (c.body as Body).ref_audio)).toEqual([undefined, undefined])
  })

  it('omits the voice description for non-VoiceDesign models when none is given', async () => {
    const calls = stubFetch(() => new Response(silentWav(0.2)))
    const media = adapter.createMedia!(
      { ...ttsConfig, defaultModel: 'mlx-community/VoxCPM2-8bit' },
      undefined,
    )
    await media.generate({
      kind: 'audio',
      injectId: 'i',
      outDir: mkdtempSync(join(tmpdir(), 'ttx-tts-')),
      brief: {
        paths: ['tts'],
        voiceLines: [{ speaker: 'PA', voiceStyle: '', text: 'Attention please.' }],
      },
    })
    expect(calls[0]!.body).not.toHaveProperty('instruct')
    expect(calls[0]!.body).not.toHaveProperty('instructions')
  })

  it('rejects non-audio jobs and briefs without voice lines', async () => {
    const media = adapter.createMedia!(ttsConfig, undefined)
    const base = { injectId: 'i', outDir: tmpdir(), brief: { paths: ['tts' as const] } }
    await expect(media.generate({ ...base, kind: 'image' })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    await expect(media.generate({ ...base, kind: 'audio' })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })

  it('reports a non-WAV body as a provider error', async () => {
    stubFetch(() => new Response('{"detail":"oops"}'))
    const media = adapter.createMedia!(ttsConfig, undefined)
    await expect(
      media.generate({
        kind: 'audio',
        injectId: 'i',
        outDir: tmpdir(),
        brief: { paths: ['tts'], voiceLines: [{ speaker: 'A', voiceStyle: '', text: 'hi' }] },
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER' })
  })
})

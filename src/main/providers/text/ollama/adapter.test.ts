// Contract test: Ollama native adapter against responses recorded from Ollama 0.40.7
// (tests/fixtures/providers/ollama-*.json, see record.mjs).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { chunkedResponse, fixtureResponse, stubFetch } from '../test-fixtures'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { OllamaTextProvider, adapter, pullModel } = await import('./adapter')

beforeAll(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ollama-'))
})
afterEach(() => vi.unstubAllGlobals())

type Body = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const config = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: 'ollama',
  kind: 'ollama',
  label: 'Ollama',
  baseUrl: 'http://127.0.0.1:11434',
  defaultModel: 'qwen2.5:3b',
  options: {},
  enabled: true,
  ...over,
})

const SCHEMA = {
  name: 'MiniMsel',
  schema: {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            wallClock: { type: 'string' },
            event: { type: 'string' },
          },
          required: ['id', 'event'],
        },
      },
    },
    required: ['rows'],
  },
}

describe('Ollama native adapter', () => {
  it('streams NDJSON tokens with format=schema and parses the recorded result', async () => {
    const calls = stubFetch([fixtureResponse('ollama-chat-format-stream', 50)])
    const tokens: string[] = []
    const res = await new OllamaTextProvider(config({ options: { numCtx: 8192 } })).chat(
      {
        system: 'You plan exercises.',
        messages: [{ role: 'user', content: 'Two rows.' }],
        json: SCHEMA,
        temperature: 0,
        maxTokens: 400,
      },
      (t) => tokens.push(t),
    )
    expect(tokens.join('').trim()).toBe(res.text)
    expect(res.structuredVia).toBe('json_schema')
    expect((res.json as Body).rows.length).toBeGreaterThanOrEqual(2)
    expect(res.usage).toEqual({ inputTokens: 73, outputTokens: 82 })
    expect(res.finishReason).toBe('stop')
    expect(res.costUsd).toBe(0)
    const body = calls[0]!.body as Body
    expect(calls[0]!.url).toBe('http://127.0.0.1:11434/api/chat')
    expect(body.format).toEqual(SCHEMA.schema)
    expect(body.options).toEqual({ temperature: 0, num_predict: 400, num_ctx: 8192 })
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You plan exercises.' })
  })

  it('accepts an OpenAI-style /v1 base URL', async () => {
    const calls = stubFetch([fixtureResponse('ollama-version')])
    await new OllamaTextProvider(config({ baseUrl: 'http://127.0.0.1:11434/v1' })).health()
    expect(calls[0]!.url).toBe('http://127.0.0.1:11434/api/version')
  })

  it('adds a pull hint when the model is missing (recorded 404)', async () => {
    stubFetch([fixtureResponse('ollama-chat-missing-model')])
    await expect(
      new OllamaTextProvider(config()).chat({
        model: 'no-such-model:1b',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('ollama pull no-such-model:1b') })
  })

  it('surfaces an error line in the stream', async () => {
    stubFetch([
      chunkedResponse(
        '{"message":{"content":"a"},"done":false}\n{"error":"model runner crashed"}\n',
      ),
    ])
    await expect(
      new OllamaTextProvider(config()).chat({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ message: 'Ollama: model runner crashed' })
  })

  it('strips <think> output from reasoning models', async () => {
    const lines = ['<think>hmm', '</think>', 'Answer.'].map((c) =>
      JSON.stringify({ message: { content: c }, done: false }),
    )
    lines.push(
      JSON.stringify({ message: { content: '' }, done: true, done_reason: 'stop', eval_count: 3 }),
    )
    stubFetch([chunkedResponse(lines.join('\n') + '\n')])
    const tokens: string[] = []
    const res = await new OllamaTextProvider(config()).chat(
      { messages: [{ role: 'user', content: 'q' }] },
      (t) => tokens.push(t),
    )
    expect(res.text).toBe('Answer.')
    expect(tokens.join('')).toBe('Answer.')
  })

  it('lists recorded models and reports the version', async () => {
    stubFetch([fixtureResponse('ollama-tags'), fixtureResponse('ollama-version')])
    const p = new OllamaTextProvider(config())
    const models = await p.listModels()
    expect(models.map((m) => m.id)).toContain('qwen2.5:3b')
    expect(models.find((m) => m.id.startsWith('nomic-embed-text'))?.kind).toBe('embedding')
    expect(await p.health()).toMatchObject({ ok: true, message: 'Ollama 0.40.7' })
  })

  it('embeds through /api/embed (recorded) and discovers dimensions', async () => {
    const calls = stubFetch([fixtureResponse('ollama-embed')])
    const e = adapter.createEmbedding!(config(), undefined, 'nomic-embed-text')
    const vecs = await e.embed(['airport emergency plan', 'baggage handling system outage'])
    expect(vecs).toHaveLength(2)
    expect(e.dims).toBe(768)
    expect(calls[0]!.body).toEqual({
      model: 'nomic-embed-text',
      input: ['airport emergency plan', 'baggage handling system outage'],
    })
  })

  it('pulls a model and reports progress (recorded stream)', async () => {
    const calls = stubFetch([fixtureResponse('ollama-pull-stream', 40)])
    const progress: { status: string; fraction?: number }[] = []
    await pullModel(config(), 'smollm:135m', (p) => progress.push(p))
    expect(calls[0]!.body).toEqual({ model: 'smollm:135m', stream: true })
    expect(progress[0]!.status).toBe('pulling manifest')
    expect(progress.some((p) => p.fraction === 1)).toBe(true)
    expect(progress.at(-1)!.status).toBe('success')
  })

  it('rejects pulls that fail or have unsafe names', async () => {
    stubFetch([
      chunkedResponse(
        '{"status":"pulling manifest"}\n{"error":"pull model manifest: file does not exist"}\n',
      ),
    ])
    await expect(pullModel(config(), 'nope:1b')).rejects.toMatchObject({
      message: expect.stringContaining('file does not exist'),
    })
    await expect(pullModel(config(), '../etc')).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

// Hosted OpenAI-compatible services (OpenAI, Gemini, Azure OpenAI, OpenRouter…): request shape
// checked against fixtures in the style of the services' documented responses. No live calls.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { HOSTED_PRESETS, hostedPresetById } from '@shared/hosted-presets'
import type { JsonSchemaSpec } from '../../types'
import { chunkedResponse, fixtureResponse, openAiSse, stubFetch } from '../test-fixtures'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { adapter } = await import('./adapter')
const { OpenAiCompatibleTextProvider, apiBaseOf } = await import('./chat')
const { clearJsonModeCache } = await import('./json-mode')
const { joinUrl } = await import('../../http')

beforeAll(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-hosted-'))
})
beforeEach(() => clearJsonModeCache())
afterEach(() => vi.unstubAllGlobals())

type Body = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** A provider as the Add provider dialog saves it for a preset. */
function fromPreset(id: string, over: Partial<ProviderConfig> = {}): ProviderConfig {
  const p = hostedPresetById(id)!
  return {
    id: `${id}-test`,
    kind: 'openai-compatible',
    label: p.label,
    baseUrl: p.baseUrl,
    defaultModel: p.defaultModel || 'my-deployment',
    options: p.options,
    enabled: true,
    ...over,
  }
}
const provider = (c: ProviderConfig, key = 'test-key-0000') =>
  new OpenAiCompatibleTextProvider(c, key)

const MINI: JsonSchemaSpec = {
  name: 'Mini',
  schema: {
    type: 'object',
    properties: { rows: { type: 'array', items: { type: 'string' } } },
    required: ['rows'],
    additionalProperties: false,
  },
}
const ask = (extra: object = {}) => ({
  messages: [{ role: 'user' as const, content: 'Hello' }],
  ...extra,
})

describe('OpenAI preset', () => {
  it('sends max_completion_tokens, a bearer key and no local-model extras', async () => {
    const calls = stubFetch([fixtureResponse('openai-chat-stream', 50)])
    // A model with a built-in profile would get top_k, min_p and a chat template switch locally.
    const c = fromPreset('openai', { defaultModel: 'qwen3-30b-a3b-2507' })
    const res = await provider(c).chat(ask({ maxTokens: 512, temperature: 0.4 }))
    const body = calls[0]!.body as Body
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(calls[0]!.headers.authorization).toBe('Bearer test-key-0000')
    expect(body.max_completion_tokens).toBe(512)
    expect(body.max_tokens).toBeUndefined()
    expect(body.temperature).toBe(0.4)
    for (const local of [
      'top_k',
      'min_p',
      'chat_template_kwargs',
      'draft_model',
      'reasoning_effort',
    ])
      expect(body[local]).toBeUndefined()
    expect(res.text).toBe('The exercise begins at STARTEX.')
    expect(res.usage).toEqual({ inputTokens: 20, outputTokens: 8 })
  })

  it('keeps max_tokens for a service that does not ask for the new field', async () => {
    const calls = stubFetch([fixtureResponse('openai-chat-stream')])
    await provider(fromPreset('groq')).chat(ask({ maxTokens: 100 }))
    expect((calls[0]!.body as Body).max_tokens).toBe(100)
    expect((calls[0]!.body as Body).max_completion_tokens).toBeUndefined()
  })

  it('asks for a strict json_schema first', async () => {
    const reply = openAiSse([
      { choices: [{ delta: { content: '{"rows":["a"]}' }, finish_reason: 'stop' }] },
    ])
    const calls = stubFetch(() => chunkedResponse(reply, { contentType: 'text/event-stream' }))
    const res = await provider(fromPreset('openai')).chat(ask({ json: MINI }))
    expect(res.json).toEqual({ rows: ['a'] })
    expect(res.structuredVia).toBe('json_schema')
    const rf = (calls[0]!.body as Body).response_format
    expect(rf.type).toBe('json_schema')
    expect(rf.json_schema.strict).toBe(true)
  })

  it('does not repeat a request after a malformed-output error, as it does for LM Studio', async () => {
    const failure = {
      error: {
        message: 'The model produced output that does not match the expected peg-native format',
      },
    }
    const calls = stubFetch(
      () =>
        new Response(JSON.stringify(failure), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    )
    // A 400 is a mode rejection: the three structured modes are tried once each, no format retries.
    await expect(provider(fromPreset('openai')).chat(ask({ json: MINI }))).rejects.toThrow(
      /HTTP 400/,
    )
    expect(calls).toHaveLength(3)
  })

  it('shows an invalid key in plain words and never echoes the key', async () => {
    stubFetch([fixtureResponse('openai-invalid-key')])
    const err = await provider(fromPreset('openai'), 'sk-live-XXXXXXXX')
      .chat(ask())
      .catch((e: Error) => e)
    expect((err as Error).message).toMatch(/HTTP 401 \(check the API key\)/)
    expect((err as Error).message).not.toContain('sk-live-XXXXXXXX')
  })

  it('lists models for Load models and reports health from the model list', async () => {
    stubFetch([fixtureResponse('openai-models'), fixtureResponse('openai-models')])
    const p = provider(fromPreset('openai'))
    const models = await p.listModels()
    expect(models.map((m) => [m.id, m.kind])).toEqual([
      ['gpt-6.1-terra', 'chat'],
      ['text-embedding-3-small', 'embedding'],
    ])
    expect((await p.health()).ok).toBe(true)
  })

  it('embeds through the preset', async () => {
    const calls = stubFetch([fixtureResponse('openai-embeddings')])
    const e = adapter.createEmbedding!(
      fromPreset('openai'),
      'k-0000-0000',
      'text-embedding-3-small',
    )
    const vecs = await e.embed(['one', 'two'])
    expect(vecs).toHaveLength(2)
    expect(e.dims).toBe(3)
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/embeddings')
    expect(calls[0]!.headers.authorization).toBe('Bearer k-0000-0000')
  })

  it('reports a price-based cost only when prices are set', async () => {
    stubFetch([fixtureResponse('openai-chat-stream'), fixtureResponse('openai-chat-stream')])
    const free = await provider(fromPreset('openai')).chat(ask())
    expect(free.costUsd).toBeUndefined()
    const base = fromPreset('openai')
    const priced = await provider({
      ...base,
      options: { ...base.options, inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
    }).chat(ask())
    expect(priced.costUsd).toBeCloseTo((20 * 1 + 8 * 5) / 1_000_000, 10)
  })
})

describe('Gemini preset', () => {
  it('uses Google’s OpenAI-compatible endpoint for chat, models and embeddings', async () => {
    const calls = stubFetch([
      fixtureResponse('openai-chat-stream'),
      fixtureResponse('openai-models'),
      fixtureResponse('openai-embeddings'),
    ])
    const c = fromPreset('gemini')
    expect(c.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai/')
    await provider(c).chat(ask({ maxTokens: 64 }))
    await provider(c).listModels()
    await adapter.createEmbedding!(c, 'k-0000-0000', 'gemini-embedding-001').embed(['a', 'b'])
    expect(calls.map((x) => x.url)).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      'https://generativelanguage.googleapis.com/v1beta/openai/models',
      'https://generativelanguage.googleapis.com/v1beta/openai/embeddings',
    ])
    expect((calls[0]!.body as Body).max_tokens).toBe(64)
  })
})

describe('Azure OpenAI preset', () => {
  const azure = (over: Partial<ProviderConfig> = {}) =>
    fromPreset('azure-openai', {
      baseUrl: 'https://contoso.openai.azure.com/openai/v1/',
      defaultModel: 'my-deployment',
      ...over,
    })

  it('sends the key in the api-key header, not Authorization', async () => {
    const calls = stubFetch([fixtureResponse('openai-chat-stream')])
    await provider(azure(), 'azure-key-0000').chat(ask())
    expect(calls[0]!.url).toBe('https://contoso.openai.azure.com/openai/v1/chat/completions')
    expect(calls[0]!.headers['api-key']).toBe('azure-key-0000')
    expect(calls[0]!.headers.authorization).toBeUndefined()
  })

  it('keeps api-version as a query parameter on every request of a deployment URL', async () => {
    const c = azure({
      baseUrl: 'https://contoso.openai.azure.com/openai/deployments/my-deployment',
      options: { ...azure().options, apiVersion: '2024-10-21' },
    })
    const calls = stubFetch([
      fixtureResponse('openai-chat-stream'),
      fixtureResponse('openai-models'),
      fixtureResponse('openai-embeddings'),
    ])
    await provider(c, 'azure-key-0000').chat(ask())
    await provider(c, 'azure-key-0000').listModels()
    await adapter.createEmbedding!(c, 'azure-key-0000', 'emb').embed(['a', 'b'])
    const root = 'https://contoso.openai.azure.com/openai/deployments/my-deployment'
    expect(calls.map((x) => x.url)).toEqual([
      `${root}/chat/completions?api-version=2024-10-21`,
      `${root}/models?api-version=2024-10-21`,
      `${root}/embeddings?api-version=2024-10-21`,
    ])
    for (const call of calls) expect(call.headers['api-key']).toBe('azure-key-0000')
  })

  it('does not double an api-version already on the base URL', () => {
    const baseUrl = 'https://c.openai.azure.com/openai/deployments/d?api-version=2025-01-01'
    const c = azure({ baseUrl, options: { ...azure().options, apiVersion: '2024-10-21' } })
    expect(apiBaseOf(c)).toBe(baseUrl)
  })
})

describe('OpenRouter preset', () => {
  it('sends its attribution headers with the bearer key', async () => {
    const calls = stubFetch([fixtureResponse('openai-chat-stream')])
    await provider(fromPreset('openrouter')).chat(ask())
    expect(calls[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(calls[0]!.headers['http-referer']).toBe('https://actionstations.ai')
    expect(calls[0]!.headers['x-openrouter-title']).toBe('Action Stations')
    expect(calls[0]!.headers.authorization).toBe('Bearer test-key-0000')
  })
})

describe('presets', () => {
  it('cover the nine hosted services with a base URL, a suggested model and cloud options', () => {
    expect(HOSTED_PRESETS.map((p) => p.id)).toEqual([
      'openai',
      'gemini',
      'openrouter',
      'mistral',
      'groq',
      'deepseek',
      'xai',
      'together',
      'azure-openai',
    ])
    for (const p of HOSTED_PRESETS) {
      expect(p.baseUrl).toMatch(/^https:\/\//)
      expect(p.options).toMatchObject({ preset: p.id, network: 'remote', modelProfile: 'off' })
      if (p.id !== 'azure-openai') expect(p.defaultModel).not.toBe('')
    }
  })

  it('joinUrl keeps and merges query strings', () => {
    expect(joinUrl('https://h/x/?a=1', '/y')).toBe('https://h/x/y?a=1')
    expect(joinUrl('https://h/x?a=1', '/y?b=2')).toBe('https://h/x/y?a=1&b=2')
    expect(joinUrl('https://h/x', 'y')).toBe('https://h/x/y')
  })
})

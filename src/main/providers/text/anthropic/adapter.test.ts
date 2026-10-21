// Contract test: Anthropic adapter against hand-built SSE fixtures (documented event format).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MselPhaseOutput, type ProviderConfig } from '@shared/schemas'
import { jsonSpec } from '../../json'
import { fixtureResponse, stubFetch } from '../test-fixtures'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { AnthropicTextProvider, adapter } = await import('./adapter')
const { estimateCostUsd, supportsForcedTool, supportsTemperature } = await import('./models')

beforeAll(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-anthropic-'))
})
afterEach(() => vi.unstubAllGlobals())

const KEY = 'sk-ant-test-0000000000000000'
const config = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: 'anthropic',
  kind: 'anthropic',
  label: 'Anthropic',
  options: {},
  enabled: true,
  ...over,
})
const provider = (over?: Partial<ProviderConfig>) => new AnthropicTextProvider(config(over), KEY)
type Body = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

describe('Anthropic adapter', () => {
  it('is discovered as the anthropic kind', () => {
    expect(adapter.kind).toBe('anthropic')
    expect(adapter.createText?.(config(), KEY)).toBeInstanceOf(AnthropicTextProvider)
  })

  it('streams text deltas in order and reports usage including cache tokens', async () => {
    const calls = stubFetch([fixtureResponse('anthropic-text-stream', 13)])
    const tokens: string[] = []
    const res = await provider().chat(
      {
        model: 'claude-sonnet-5-5',
        system: 'You write tabletop exercises.',
        cacheableContext: 'AEP section 4.2 …',
        messages: [{ role: 'user', content: 'Define a TTX.' }],
        temperature: 0.2,
      },
      (t) => tokens.push(t),
    )
    expect(tokens).toEqual(['A tabletop exercise ', 'rehearses a plan ', 'by discussion.'])
    expect(res.text).toBe('A tabletop exercise rehearses a plan by discussion.')
    expect(res.finishReason).toBe('stop')
    expect(res.usage).toEqual({
      inputTokens: 412,
      outputTokens: 14,
      cacheWriteTokens: 2048,
      cacheReadTokens: 0,
    })
    // 412*2 + 2048*2*1.25 + 14*10 per MTok
    expect(res.costUsd).toBeCloseTo((412 * 2 + 2048 * 2.5 + 14 * 10) / 1e6, 9)

    const req = calls[0]!
    expect(req.url).toBe('https://api.anthropic.com/v1/messages')
    expect(req.headers['x-api-key']).toBe(KEY)
    expect(req.headers['anthropic-version']).toBe('2023-06-01')
    expect(req.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01')
    const body = req.body as Body
    expect(body.stream).toBe(true)
    expect(body.fallbacks).toBe('default')
    expect(body.system).toEqual([
      { type: 'text', text: 'You write tabletop exercises.' },
      { type: 'text', text: 'AEP section 4.2 …', cache_control: { type: 'ephemeral' } },
    ])
    expect(body.temperature).toBeUndefined() // rejected by 5.x models
    expect(body.output_config).toEqual({ effort: 'high' })
  })

  it('returns structured output from the tool input and restores optional fields', async () => {
    const calls = stubFetch([fixtureResponse('anthropic-tool-stream', 41)])
    const streamed: string[] = []
    const res = await provider().chat(
      {
        messages: [{ role: 'user', content: 'Two MSEL rows.' }],
        json: jsonSpec('MselPhaseOutput', MselPhaseOutput),
      },
      (t) => streamed.push(t),
    )
    expect(res.structuredVia).toBe('tool_use')
    expect(res.finishReason).toBe('tool_use')
    expect(MselPhaseOutput.parse(res.json).rows).toHaveLength(2)
    expect((res.json as Body).rows[0]).not.toHaveProperty('wallClock')
    expect(streamed.join('')).toBe(res.text)
    expect(res.usage.cacheReadTokens).toBe(5120)

    const body = calls[0]!.body as Body
    expect(body.model).toBe('claude-opus-5-5')
    // Opus 5.5 rejects forced tool_choice: auto + strict tool + instruction instead.
    expect(body.tool_choice).toEqual({ type: 'auto' })
    expect(body.tools[0]).toMatchObject({
      name: 'MselPhaseOutput',
      strict: true,
      eager_input_streaming: true,
    })
    expect(body.tools[0].input_schema.properties.rows.items.additionalProperties).toBe(false)
    expect(JSON.stringify(body.tools[0].input_schema)).not.toContain('"pattern"')
    expect(body.system.at(-1).text).toContain('calling the MselPhaseOutput tool exactly once')
  })

  it('forces the tool on models that support forced tool_choice', () => {
    const { body } = provider().buildBody('claude-haiku-4-5', {
      messages: [{ role: 'user', content: 'x' }],
      json: jsonSpec('MselPhaseOutput', MselPhaseOutput),
      temperature: 0.3,
    })
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'MselPhaseOutput' })
    expect(body.temperature).toBe(0.3)
    expect(body.output_config).toBeUndefined()
    expect(body.fallbacks).toBeUndefined()
  })

  it('retries a 429 and then succeeds', async () => {
    const limited = fixtureResponse('anthropic-rate-limit')
    const headers = new Headers(limited.headers)
    headers.set('retry-after-ms', '1')
    const calls = stubFetch([
      new Response(limited.body, { status: 429, headers }),
      fixtureResponse('anthropic-text-stream'),
    ])
    const res = await provider().chat({
      model: 'claude-sonnet-5-5',
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(calls).toHaveLength(2)
    expect(res.text).toContain('tabletop')
  })

  it('surfaces mid-stream error events and refusals as PROVIDER errors', async () => {
    stubFetch([fixtureResponse('anthropic-stream-error')])
    await expect(
      provider().chat({ messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({
      code: 'PROVIDER',
      message: expect.stringContaining('overloaded_error'),
    })
    stubFetch([fixtureResponse('anthropic-refusal')])
    await expect(
      provider().chat({ messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({
      message: 'Anthropic declined this request (cyber)',
    })
  })

  it('cancels an in-flight stream when the signal aborts', async () => {
    const ctrl = new AbortController()
    stubFetch([fixtureResponse('anthropic-text-stream', 7)])
    const run = provider().chat(
      { messages: [{ role: 'user', content: 'x' }], signal: ctrl.signal },
      () => ctrl.abort(),
    )
    await expect(run).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('requires an API key without making a request', async () => {
    const calls = stubFetch([])
    const p = new AnthropicTextProvider(config(), undefined)
    await expect(p.chat({ messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    expect(await p.health()).toMatchObject({ ok: false, message: 'No API key stored' })
    expect(calls).toHaveLength(0)
  })

  it('lists models with context windows and checks health', async () => {
    stubFetch([fixtureResponse('anthropic-models'), fixtureResponse('anthropic-models')])
    const models = await provider().listModels()
    expect(models[0]).toEqual({
      id: 'claude-opus-5-5',
      label: 'Claude Opus 5.5',
      contextWindow: 1_000_000,
      kind: 'chat',
    })
    expect(await provider().health()).toMatchObject({ ok: true })
  })
})

describe('Anthropic model rules', () => {
  it('knows which models take forced tools and temperature', () => {
    expect(supportsForcedTool('claude-opus-5-5')).toBe(false)
    expect(supportsForcedTool('claude-opus-5')).toBe(true)
    expect(supportsTemperature('claude-opus-5-5')).toBe(false)
    expect(supportsTemperature('claude-sonnet-4-5-20250929')).toBe(true)
    expect(supportsTemperature('claude-opus-4-8')).toBe(false)
  })

  it('prices Haiku 5.5 long prompts at the long-context rate', () => {
    expect(estimateCostUsd('claude-haiku-5-5', { inputTokens: 1_000_000, outputTokens: 0 })).toBe(
      0.5,
    )
    expect(estimateCostUsd('claude-haiku-5-5', { inputTokens: 50_000, outputTokens: 0 })).toBe(
      0.005,
    )
    expect(estimateCostUsd('some-other-model', { inputTokens: 1, outputTokens: 1 })).toBeUndefined()
  })
})

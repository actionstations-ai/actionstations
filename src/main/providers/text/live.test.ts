// Live tests (LIVE=1) against local servers only — never paid APIs:
//   LM Studio  LIVE_LMSTUDIO_URL  (http://127.0.0.1:1234/v1), model LIVE_LMSTUDIO_MODEL
//   Ollama     LIVE_OLLAMA_URL    (http://127.0.0.1:11434),   model LIVE_OLLAMA_MODEL
//   mlx-audio  LIVE_TTS_URL       (http://127.0.0.1:8765), models LIVE_TTS_MODELS (comma list)
// Each test prints latency and token counts; LIVE_REPORT=<file> also writes them as JSON.
import { appendFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MselPhaseOutput, type ProviderConfig } from '@shared/schemas'
import { jsonSpec } from '../json'
import type { ChatResponse } from '../types'
import { LIVE } from './test-fixtures'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { createEmbeddingProvider, createMediaProvider, createTextProvider } =
  await import('../registry')
const { pullModel } = await import('./ollama/adapter')

const LM_URL = process.env.LIVE_LMSTUDIO_URL ?? 'http://127.0.0.1:1234/v1'
const LM_MODEL = process.env.LIVE_LMSTUDIO_MODEL ?? 'qwen3-30b-a3b-2507'
const LM_EMBED = process.env.LIVE_LMSTUDIO_EMBED ?? 'text-embedding-nomic-embed-text-v1.5'
const OL_URL = process.env.LIVE_OLLAMA_URL ?? 'http://127.0.0.1:11434'
const OL_MODEL = process.env.LIVE_OLLAMA_MODEL ?? 'qwen2.5:3b'
const TTS_URL = process.env.LIVE_TTS_URL ?? 'http://127.0.0.1:8765'

beforeAll(() => {
  process.env.TTX_USER_DATA ??= mkdtempSync(join(tmpdir(), 'ttx-live-'))
})

const cfg = (
  kind: ProviderConfig['kind'],
  id: string,
  baseUrl: string,
  defaultModel?: string,
): ProviderConfig => ({
  id,
  kind,
  label: id,
  baseUrl,
  defaultModel,
  options: {},
  enabled: true,
})

function report(name: string, data: Record<string, unknown>): void {
  console.log(`[live] ${name}`, JSON.stringify(data))
  if (process.env.LIVE_REPORT)
    appendFileSync(process.env.LIVE_REPORT, JSON.stringify({ name, ...data }) + '\n')
}

const metrics = (r: ChatResponse) => ({
  model: r.model,
  latencyMs: r.latencyMs,
  inputTokens: r.usage.inputTokens,
  outputTokens: r.usage.outputTokens,
  structuredVia: r.structuredVia,
  finishReason: r.finishReason,
})

const MSEL_PROMPT = [
  'Retrieved plan sections: C1 = Airport Emergency Plan 4.2 (EOC activation), C2 = TIRP 3.1 (ransomware containment), C3 = AEP 7.4 (public information).',
  'Write the MSEL rows for phase 1 of an airport ransomware tabletop: START at T+0:00, then three injects (I-01..I-03) every 10 minutes.',
  'Use role keys "ops", "it", "pio" in `to`. purposeTag values must come from the schema enum. `format` is an inject type id such as "email", "ticket", "phone_call".',
  'Cite only C1-C3.',
].join('\n')

describe.skipIf(!LIVE)('live: LM Studio (OpenAI-compatible)', () => {
  const lm = () => createTextProvider(cfg('openai-compatible', 'lmstudio', LM_URL, LM_MODEL))

  it('chats with streaming', async () => {
    let tokens = 0
    const r = await lm().chat(
      {
        messages: [{ role: 'user', content: 'In one sentence: what is an MSEL?' }],
        maxTokens: 120,
      },
      () => tokens++,
    )
    report('lmstudio chat', { ...metrics(r), streamedChunks: tokens })
    expect(r.text.length).toBeGreaterThan(10)
    expect(tokens).toBeGreaterThan(1)
  }, 120_000)

  it('returns MselPhaseOutput via json_schema', async () => {
    const r = await lm().chat({
      messages: [{ role: 'user', content: MSEL_PROMPT }],
      json: jsonSpec('MselPhaseOutput', MselPhaseOutput),
      maxTokens: 2000,
    })
    const parsed = MselPhaseOutput.safeParse(r.json)
    report('lmstudio json_schema MselPhaseOutput', {
      ...metrics(r),
      zodValid: parsed.success,
      rows: parsed.data?.rows.length,
    })
    expect(r.structuredVia).toBe('json_schema')
    expect(parsed.success).toBe(true)
  }, 300_000)

  it('embeds with nomic', async () => {
    const e = createEmbeddingProvider(cfg('openai-compatible', 'lmstudio', LM_URL), LM_EMBED)
    const t0 = Date.now()
    const v = await e.embed([
      'Airport Emergency Plan EOC activation',
      'baggage handling system outage',
      'press release for travellers',
    ])
    report('lmstudio embeddings', {
      model: LM_EMBED,
      latencyMs: Date.now() - t0,
      vectors: v.length,
      dims: e.dims,
    })
    expect(e.dims).toBe(768)
  }, 120_000)
})

const OSS_MODEL = process.env.LIVE_LMSTUDIO_OSS_MODEL ?? 'gpt-oss-20b'

// #142: gpt-oss in prompt mode streams harmony framing; the stream must carry only the answer.
describe.skipIf(!LIVE || !process.env.LIVE_GPT_OSS)('live: LM Studio gpt-oss harmony', () => {
  it('streams no control tokens or analysis text in prompt mode, and the JSON parses', async () => {
    const config = cfg('openai-compatible', 'lmstudio-oss', LM_URL, OSS_MODEL)
    config.options = { jsonMode: 'prompt' }
    const chunks: string[] = []
    const r = await createTextProvider(config).chat(
      {
        messages: [{ role: 'user', content: MSEL_PROMPT }],
        json: jsonSpec('MselPhaseOutput', MselPhaseOutput),
        maxTokens: 4000,
      },
      (t) => chunks.push(t),
    )
    const streamed = chunks.join('')
    const parsed = MselPhaseOutput.safeParse(r.json)
    report('lmstudio gpt-oss prompt-mode stream', {
      ...metrics(r),
      streamedChunks: chunks.length,
      streamedChars: streamed.length,
      controlTokens: (streamed.match(/<\|[a-z_]+\|>/g) ?? []).length,
      zodValid: parsed.success,
    })
    expect(streamed).not.toMatch(/<\|[a-z_]+\|>/)
    expect(streamed).not.toMatch(/^\s*(?:analysis|final|assistant)\b/)
    expect(streamed.trim().length).toBeGreaterThan(0)
    expect(parsed.success).toBe(true)
  }, 600_000)
})

describe.skipIf(!LIVE)('live: Ollama native', () => {
  const ol = () => createTextProvider(cfg('ollama', 'ollama', OL_URL, OL_MODEL))

  it('reports health and pulls a model with progress', async () => {
    const h = await ol().health()
    let updates = 0
    const t0 = Date.now()
    await pullModel(cfg('ollama', 'ollama', OL_URL), 'smollm:135m', () => updates++)
    report('ollama health + pull', { health: h, pullMs: Date.now() - t0, progressUpdates: updates })
    expect(h.ok).toBe(true)
    expect(updates).toBeGreaterThan(0)
  }, 600_000)

  it('chats with a format schema (MselPhaseOutput)', async () => {
    const r = await ol().chat({
      messages: [{ role: 'user', content: MSEL_PROMPT }],
      json: jsonSpec('MselPhaseOutput', MselPhaseOutput),
      temperature: 0,
      maxTokens: 2000,
    })
    const parsed = MselPhaseOutput.safeParse(r.json)
    report('ollama format MselPhaseOutput', {
      ...metrics(r),
      zodValid: parsed.success,
      rows: parsed.data?.rows.length,
      issues: parsed.error?.issues.slice(0, 3),
    })
    expect(r.json).toBeTypeOf('object')
    expect(Array.isArray((r.json as { rows?: unknown }).rows)).toBe(true)
  }, 300_000)

  it('embeds with nomic-embed-text', async () => {
    const e = createEmbeddingProvider(cfg('ollama', 'ollama', OL_URL), 'nomic-embed-text')
    const t0 = Date.now()
    const v = await e.embed([
      'Airport Emergency Plan EOC activation',
      'baggage handling system outage',
    ])
    report('ollama embed', { latencyMs: Date.now() - t0, vectors: v.length, dims: e.dims })
    expect(e.dims).toBe(768)
  }, 120_000)
})

describe.skipIf(!LIVE)('live: mlx-audio TTS (OpenAI-compatible /v1/audio/speech)', () => {
  const models = (
    process.env.LIVE_TTS_MODELS ??
    'mlx-community/VoxCPM2-8bit,mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16'
  ).split(',')
  for (const model of models) {
    it(`voices a two-speaker phone call with ${model}`, async () => {
      const media = createMediaProvider(cfg('openai-compatible', 'mlx-audio', TTS_URL, model))
      const outDir = mkdtempSync(join(tmpdir(), 'ttx-live-tts-'))
      const t0 = Date.now()
      const [out] = await media.generate({
        kind: 'audio',
        injectId: 'I-04',
        outDir,
        brief: {
          paths: ['tts'],
          voiceLines: [
            {
              speaker: 'Ramp agent',
              voiceStyle: 'A stressed male airport ramp agent, fast speech',
              text: 'Ops, the baggage belts in Terminal B just stopped.',
            },
            {
              speaker: 'Ops duty manager',
              voiceStyle: 'A calm female operations manager',
              text: 'Copy. Hold the bags and stand by for instructions.',
            },
          ],
        },
      })
      report(`tts ${model}`, {
        latencyMs: Date.now() - t0,
        durationSec: out?.durationSec,
        file: out?.filePath,
      })
      expect(out?.mimeType).toBe('audio/wav')
      expect(out!.durationSec!).toBeGreaterThan(2)
    }, 300_000)
  }
})

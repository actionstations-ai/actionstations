import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { WaveFile } from 'wavefile'
import type { ProviderConfig } from '@shared/schemas'
import { STAGE_OUTPUT_SCHEMAS, type StageOutputSchemaName } from '@shared/schemas'
import type {
  AdapterModule,
  ChatRequest,
  ChatResponse,
  MediaJob,
  MediaOutput,
  MediaProvider,
  TextProvider,
} from '../types'
import { HashEmbedder } from '../embedding/hash'
import { MOCK_FIXTURES } from './fixtures'

export type MockResponder = (req: ChatRequest) => unknown | Promise<unknown>

/** Test hook: override what the mock returns for a schema name (or for free text with "*"). */
const overrides = new Map<string, MockResponder>()
export function setMockResponse(
  schemaName: StageOutputSchemaName | '*',
  responder: MockResponder,
): void {
  overrides.set(schemaName, responder)
}
export function clearMockResponses(): void {
  overrides.clear()
}

export class MockTextProvider implements TextProvider {
  readonly kind = 'mock' as const
  constructor(readonly config: ProviderConfig) {}
  get id(): string {
    return this.config.id
  }

  async listModels() {
    return [
      { id: 'mock-large', label: 'Mock large', kind: 'chat' as const },
      { id: 'mock-small', kind: 'chat' as const },
    ]
  }

  async health() {
    return { ok: true, latencyMs: 0, message: 'Mock provider' }
  }

  async chat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResponse> {
    const name = req.json?.name ?? '*'
    const responder = overrides.get(name)
    let value: unknown
    if (responder) value = await responder(req)
    else if (req.json && name in MOCK_FIXTURES) value = MOCK_FIXTURES[name as StageOutputSchemaName]
    else if (req.json) throw new Error(`Mock provider has no fixture for ${name}`)
    else value = 'Mock response.'
    if (req.json && name in STAGE_OUTPUT_SCHEMAS) {
      // Fail loudly if a fixture drifts from its schema.
      STAGE_OUTPUT_SCHEMAS[name as StageOutputSchemaName].parse(value)
    }
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    if (onToken) for (let i = 0; i < text.length; i += 64) onToken(text.slice(i, i + 64))
    return {
      text,
      ...(typeof value === 'string' ? {} : { json: value }),
      model: req.model ?? this.config.defaultModel ?? 'mock-large',
      usage: {
        inputTokens: Math.ceil(JSON.stringify(req.messages).length / 4),
        outputTokens: Math.ceil(text.length / 4),
      },
      finishReason: 'stop',
      latencyMs: 0,
      structuredVia: req.json ? 'tool_use' : undefined,
    }
  }
}

export class MockMediaProvider implements MediaProvider {
  readonly kind = 'mock' as const
  constructor(readonly config: ProviderConfig) {}
  get id(): string {
    return this.config.id
  }
  capabilities() {
    return new Set(['image', 'video', 'audio'] as const)
  }
  async health() {
    return { ok: true, latencyMs: 0 }
  }

  async generate(job: MediaJob): Promise<MediaOutput[]> {
    await fs.mkdir(job.outDir, { recursive: true })
    const provenance = {
      provider: this.id,
      model: 'mock',
      prompt: job.brief.imagePrompt ?? job.brief.videoPrompt,
      seed: job.seed ?? 0,
    }
    if (job.kind === 'audio') {
      const wav = new WaveFile()
      wav.fromScratch(1, 44100, '16', new Int16Array(44100))
      const filePath = join(job.outDir, `${job.injectId}-mock.wav`)
      await fs.writeFile(filePath, wav.toBuffer())
      return [{ kind: 'audio', filePath, mimeType: 'audio/wav', durationSec: 1, provenance }]
    }
    const width = job.width ?? 640
    const height = job.height ?? 360
    const png = new PNG({ width, height })
    png.data.fill(0x80)
    const filePath = join(job.outDir, `${job.injectId}-mock.png`)
    await fs.writeFile(filePath, PNG.sync.write(png))
    // Video mock returns a poster frame only; real adapters return MP4 + poster.
    return [
      {
        kind: job.kind === 'video' ? 'video' : 'image',
        filePath,
        mimeType: 'image/png',
        width,
        height,
        provenance,
      },
    ]
  }
}

export const adapter: AdapterModule = {
  kind: 'mock',
  createText: (config) => new MockTextProvider(config),
  createEmbedding: () => new HashEmbedder(),
  createMedia: (config) => new MockMediaProvider(config),
}

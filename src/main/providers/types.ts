// Provider interfaces (docs/02-ARCHITECTURE.md §Providers). Every model/media call in the
// app goes through one of these; vendor specifics stay inside an adapter folder.
import type {
  MediaBrief,
  ModelInfo,
  ProviderConfig,
  ProviderHealth,
  ProviderKind,
  Provenance,
} from '@shared/schemas'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface JsonSchemaSpec {
  /** Schema name, e.g. "MselPhaseOutput" (used as tool name / response_format name). */
  name: string
  /** JSON Schema object (z.toJSONSchema output). */
  schema: Record<string, unknown>
}

export interface ChatRequest {
  model?: string
  system?: string
  /** Large, stable context (retrieved doctrine) the adapter may cache (Anthropic prompt caching). */
  cacheableContext?: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  stop?: string[]
  /** Ask for structured output. Adapters use tool-use / json_schema when available. */
  json?: JsonSchemaSpec
  signal?: AbortSignal
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

export interface ChatResponse {
  /** Raw text output (for json requests, the JSON text). */
  text: string
  /** Parsed JSON when the adapter obtained it natively (tool-use / json mode). Not yet zod-validated. */
  json?: unknown
  model: string
  usage: Usage
  finishReason: 'stop' | 'length' | 'tool_use' | 'error' | 'other'
  costUsd?: number
  latencyMs: number
  /** How structured output was obtained. */
  structuredVia?: 'tool_use' | 'json_schema' | 'json_object' | 'prompt'
}

export interface TextProvider {
  readonly id: string
  readonly kind: ProviderKind
  readonly config: ProviderConfig
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>
  chat(req: ChatRequest, onToken?: (text: string) => void): Promise<ChatResponse>
  health(signal?: AbortSignal): Promise<ProviderHealth>
}

export interface EmbeddingProvider {
  readonly id: string
  readonly model: string
  readonly dims: number
  embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]>
}

export type MediaCapability = 'image' | 'video' | 'audio'

export interface MediaJob {
  kind: MediaCapability
  injectId: string
  brief: MediaBrief
  /** Workflow to use (ComfyUI); adapter picks its default for `kind` when absent. */
  workflowId?: string
  width?: number
  height?: number
  seed?: number
  /** Absolute dir where outputs must be written. */
  outDir: string
  /** Optional input image for image-to-video / compositing. */
  inputImagePath?: string
  signal?: AbortSignal
}

export interface MediaOutput {
  kind: MediaCapability
  /** Absolute path of the written file (inside job.outDir). */
  filePath: string
  mimeType: string
  width?: number
  height?: number
  durationSec?: number
  posterPath?: string
  provenance: Omit<Provenance, 'createdAt'>
}

export interface MediaProgress {
  progress: number
  message?: string
}

export interface MediaProvider {
  readonly id: string
  readonly kind: ProviderKind
  readonly config: ProviderConfig
  capabilities(): Set<MediaCapability>
  health(signal?: AbortSignal): Promise<ProviderHealth>
  generate(job: MediaJob, onProgress?: (p: MediaProgress) => void): Promise<MediaOutput[]>
}

/** What an adapter module exports (src/main/providers/<area>/<name>/adapter.ts). */
export interface AdapterModule {
  kind: ProviderKind
  createText?: (config: ProviderConfig, secret: string | undefined) => TextProvider
  createEmbedding?: (
    config: ProviderConfig,
    secret: string | undefined,
    model: string,
  ) => EmbeddingProvider
  createMedia?: (config: ProviderConfig, secret: string | undefined) => MediaProvider
  /** Default config used by onboarding/detection, if this adapter talks to a localhost service. */
  localDefaults?: { label: string; baseUrl: string }[]
}

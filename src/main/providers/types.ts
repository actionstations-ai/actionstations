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

/** One retrieved plan section in a request (FR-15). */
export interface OutboundExcerptRef {
  chunkId: number
  documentId: string
  documentTitle: string
  headingPath: string
  page?: number
  text: string
}

/**
 * What a request is for, read by the outbound gate (#433) for the preview and the send log.
 * Adapters never see it: the gate strips it before calling them.
 */
export interface OutboundMeta {
  jobId?: string
  projectPath?: string
  /** Routing task ('ideate', 'draft', 'critique'). */
  task?: string
  stage?: string
  itemId?: string
  excerpts: OutboundExcerptRef[]
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
  /** Request metadata for the outbound gate; adapters ignore it (FR-15). */
  outbound?: OutboundMeta
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
  /** Placeholders in the reply that this project never issued (REDACTION_UNKNOWN, #433). */
  unknownPlaceholders?: string[]
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

export interface TranscribeJob {
  /** Absolute path of a 16 kHz mono PCM16 WAV inside the project. */
  audioPath: string
  model?: string
  /** ISO 639-1 code; undefined means English for the built-in models (no detection). */
  language?: string
  /** Resume here: audio before this second is already transcribed. */
  fromSec?: number
  signal?: AbortSignal
}

export interface TranscriptSegmentOut {
  startSec: number
  endSec: number
  text: string
  avgLogProb?: number
}

/** Progress after each finished window: everything before doneUntilSec is final. */
export interface TranscribeProgress {
  segments: TranscriptSegmentOut[]
  doneUntilSec: number
  /** 0..1 of the whole recording. */
  progress: number
}

export interface SpeechToTextProvider {
  readonly id: string
  readonly kind: ProviderKind
  readonly config: ProviderConfig
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>
  health(signal?: AbortSignal): Promise<ProviderHealth>
  transcribe(
    job: TranscribeJob,
    onWindow: (p: TranscribeProgress) => void | Promise<void>,
  ): Promise<{ language: string; model: string }>
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
  /** Speech to text (#425). Only adapters that run on this computer may provide it. */
  createSpeechToText?: (config: ProviderConfig, secret: string | undefined) => SpeechToTextProvider
  /** Default config used by onboarding/detection, if this adapter talks to a localhost service. */
  localDefaults?: { label: string; baseUrl: string }[]
}

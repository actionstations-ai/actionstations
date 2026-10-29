// The outbound gate (#433): one check point between the app and every cloud provider. Text,
// embedding and media providers are wrapped where they are built (providers/resolve.ts), so no
// adapter changes and every caller is covered. For a local provider nothing is wrapped (NFR-6).
//
// chat(req): redact system, context and messages → build the manifest → ask under the review
// policy (waiting for the user when needed) → check the approved hash against the exact request
// → strip the metadata, call the adapter → restore placeholders in the reply → log the send.
// Embedding and media requests are previewed and approved, never redacted (FR-3).
import { resolve } from 'node:path'
import type {
  ApprovalKind,
  CloudSendEntry,
  OutboundKind,
  OutboundManifest,
  PrivacySettings,
  ProviderConfig,
  RedactionCategory,
} from '@shared/schemas'
import { isRemoteProvider, providerHost } from '@shared/provider-network'
import { currentJob } from '../../jobs/scope'
import { AppError } from '../../lib/errors'
import { nowIso } from '../../lib/ids'
import { extractJson } from '../json'
import type {
  ChatRequest,
  ChatResponse,
  EmbeddingProvider,
  MediaJob,
  MediaOutput,
  MediaProgress,
  MediaProvider,
  OutboundMeta,
  TextProvider,
} from '../types'
import { scopeKeyFor, type Approvals } from './approvals'
import type { DetectContext } from './detect'
import { buildManifest, hashRequest, type ManifestExcerpt, type ManifestPart } from './manifest'
import { redactText, type RedactionRegistry } from './redact'
import { reverseDeep, reverseText } from './reverse'

/** Prepended to the system prompt of a request that carries placeholders. App text: not redacted. */
export const PLACEHOLDER_INSTRUCTION =
  'Some names, phone numbers, emails and addresses are replaced with placeholders like ' +
  '[[PERSON_7F3K]]. Use the placeholders exactly as written wherever you refer to them; never ' +
  'invent new ones.'

/** The fixed text embedders send once to learn their vector size; no project content. */
export const DIMENSION_PROBE = 'dimension probe'

/** A request rebuilt this many times (settings kept changing while it waited) gives up. */
const MAX_REBUILDS = 20

export interface GateDeps {
  approvals: Approvals
  privacy(projectPath?: string): Promise<PrivacySettings>
  context(settings: PrivacySettings, projectPath?: string): Promise<DetectContext>
  registry(projectPath?: string): Promise<RedactionRegistry>
  enabled(settings: PrivacySettings): ReadonlySet<RedactionCategory>
  log(entry: CloudSendEntry, projectPath?: string): Promise<void>
}

interface Where {
  jobId?: string
  projectPath?: string
  signal?: AbortSignal
}

function where(meta: Partial<OutboundMeta> | undefined, signal?: AbortSignal): Where {
  const job = currentJob()
  const jobId = meta?.jobId ?? job?.jobId
  const given = meta?.projectPath ?? job?.projectPath
  const projectPath = given ? resolve(given) : undefined
  const sig = signal ?? job?.signal
  return {
    ...(jobId ? { jobId } : {}),
    ...(projectPath ? { projectPath } : {}),
    ...(sig ? { signal: sig } : {}),
  }
}

interface Prepared<T> {
  manifest: OutboundManifest
  /** What goes to the adapter. */
  body: T
  hash: string
}

/**
 * Ask (when the policy says so) and return the approval to record, rebuilding the request when
 * settings change while it waits. The approved hash must equal the hash of the body being sent.
 */
async function approve<P extends Prepared<unknown>>(
  deps: GateDeps,
  config: ProviderConfig,
  at: Where,
  prepare: () => Promise<P>,
): Promise<{ prepared: P; approval: ApprovalKind }> {
  const scopeKey = scopeKeyFor(config.id, at.jobId, at.projectPath)
  for (let round = 0; round < MAX_REBUILDS; round++) {
    const prepared = await prepare()
    const auth = await deps.approvals.authorize(scopeKey, prepared.manifest, at.signal)
    if ('recompute' in auth) continue
    if (auth.approvedHash !== prepared.hash)
      throw new AppError('CONFLICT', 'The request changed after it was approved; it was not sent.')
    return { prepared, approval: auth.approval }
  }
  throw new AppError('CONFLICT', 'The request kept changing while it waited; it was not sent.')
}

function logEntry(
  config: ProviderConfig,
  manifest: OutboundManifest,
  approval: ApprovalKind,
): CloudSendEntry {
  return {
    at: nowIso(),
    providerId: config.id,
    providerLabel: config.label,
    host: manifest.host,
    model: manifest.model,
    kind: manifest.kind,
    task: manifest.task,
    ...(manifest.stage ? { stage: manifest.stage } : {}),
    ...(manifest.itemId ? { itemId: manifest.itemId } : {}),
    ...(manifest.jobId ? { jobId: manifest.jobId } : {}),
    excerpts: manifest.excerpts.map((e) => ({
      documentId: e.documentId,
      headingPath: e.headingPath,
    })),
    chars: Object.fromEntries(manifest.parts.map((p) => [p.name, p.chars])),
    redactions: manifest.redactions,
    approval,
    requestHash: manifest.requestHash,
  }
}

const destination = (config: ProviderConfig) => ({
  host: providerHost(config),
  providerId: config.id,
})

// ---- text ----------------------------------------------------------------------------------

type ChatBody = Omit<ChatRequest, 'outbound' | 'signal'>

const chatHashBody = (b: ChatBody) => ({
  model: b.model,
  system: b.system,
  cacheableContext: b.cacheableContext,
  messages: b.messages,
  temperature: b.temperature,
  maxTokens: b.maxTokens,
  stop: b.stop,
  json: b.json,
})

class GuardedTextProvider implements TextProvider {
  constructor(
    private readonly inner: TextProvider,
    private readonly deps: GateDeps,
  ) {}

  get id(): string {
    return this.inner.id
  }
  get kind() {
    return this.inner.kind
  }
  get config(): ProviderConfig {
    return this.inner.config
  }

  listModels(signal?: AbortSignal) {
    return this.inner.listModels(signal)
  }

  health(signal?: AbortSignal) {
    return this.inner.health(signal)
  }

  private async prepare(
    req: ChatRequest,
    at: Where,
  ): Promise<Prepared<ChatBody> & { registry: RedactionRegistry }> {
    const { outbound, signal: _signal, ...rest } = req
    const settings = await this.deps.privacy(at.projectPath)
    const enabled = this.deps.enabled(settings)
    const ctx = await this.deps.context(settings, at.projectPath)
    const registry = await this.deps.registry(at.projectPath)
    const red = (t: string) => redactText(t, enabled, ctx, registry)
    const parts: ManifestPart[] = []
    const add = (name: string, text: string): string => {
      const r = red(text)
      parts.push({ name, text: r.text, spans: r.spans })
      return r.text
    }
    const system = rest.system !== undefined ? red(rest.system) : undefined
    const context =
      rest.cacheableContext !== undefined
        ? add('cacheableContext', rest.cacheableContext)
        : undefined
    const messages = rest.messages.map((m, i) => ({
      role: m.role,
      content: add(`message:${i}:${m.role}`, m.content),
    }))
    const placed = parts.some((p) => p.spans.length) || !!system?.spans.length
    let systemText = system?.text
    let systemSpans = system?.spans ?? []
    if (placed) {
      const prefix = `${PLACEHOLDER_INSTRUCTION}\n\n`
      systemText = prefix + (systemText ?? '')
      systemSpans = systemSpans.map((s) => ({
        ...s,
        start: s.start + prefix.length,
        end: s.end + prefix.length,
      }))
    }
    if (systemText !== undefined)
      parts.unshift({ name: 'system', text: systemText, spans: systemSpans })
    const body: ChatBody = {
      ...rest,
      ...(systemText !== undefined ? { system: systemText } : {}),
      ...(context !== undefined ? { cacheableContext: context } : {}),
      messages,
    }
    const excerpts: ManifestExcerpt[] = (outbound?.excerpts ?? []).map((e) => {
      const r = red(e.text)
      return { ...e, text: r.text, spans: r.spans }
    })
    const config = this.inner.config
    const hash = hashRequest(destination(config), chatHashBody(body))
    const manifest = buildManifest({
      kind: 'chat',
      providerId: config.id,
      providerLabel: config.label,
      host: providerHost(config),
      model: body.model ?? config.defaultModel ?? '',
      task: outbound?.task ?? 'chat',
      review: settings.review,
      requestHash: hash,
      redactable: true,
      parts,
      excerpts,
      ...at,
      ...(outbound?.stage ? { stage: outbound.stage } : {}),
      ...(outbound?.itemId ? { itemId: outbound.itemId } : {}),
    })
    return { manifest, body, hash, registry }
  }

  async chat(req: ChatRequest, onToken?: (text: string) => void): Promise<ChatResponse> {
    const at = where(req.outbound, req.signal)
    const { prepared, approval } = await approve(this.deps, this.config, at, () =>
      this.prepare(req, at),
    )
    const sent: ChatRequest = { ...prepared.body, ...(req.signal ? { signal: req.signal } : {}) }
    if (hashRequest(destination(this.config), chatHashBody(sent)) !== prepared.hash)
      throw new AppError('CONFLICT', 'The request changed after it was approved; it was not sent.')
    await this.deps.log(logEntry(this.config, prepared.manifest, approval), at.projectPath)
    const res = await this.inner.chat(sent, onToken)
    return restore(res, prepared.registry, !!req.json)
  }
}

/** Put the real values back into the reply (FR-13); report placeholders the project never issued. */
function restore(res: ChatResponse, registry: RedactionRegistry, wantsJson: boolean): ChatResponse {
  if (registry.size === 0) return res
  const unknown = new Set<string>()
  const text = reverseText(res.text, registry)
  text.unknown.forEach((u) => unknown.add(u))
  let json = res.json
  if (json === undefined && wantsJson) json = extractJson(res.text)
  if (json !== undefined) {
    const r = reverseDeep(json, registry)
    r.unknown.forEach((u) => unknown.add(u))
    json = r.value
  }
  return {
    ...res,
    text: text.value,
    ...(json !== undefined ? { json } : {}),
    ...(unknown.size ? { unknownPlaceholders: [...unknown] } : {}),
  }
}

// ---- embeddings ----------------------------------------------------------------------------

class GuardedEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly inner: EmbeddingProvider,
    private readonly config: ProviderConfig,
    private readonly deps: GateDeps,
  ) {}

  get id(): string {
    return this.inner.id
  }
  get model(): string {
    return this.inner.model
  }
  get dims(): number {
    return this.inner.dims
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    if (texts.length === 1 && texts[0] === DIMENSION_PROBE) return this.inner.embed(texts, signal)
    const at = where(undefined, signal)
    const parts = texts.map((t, i) => ({ name: `Text ${i + 1}`, text: t, spans: [] }))
    const { prepared, approval } = await approve(this.deps, this.config, at, () =>
      unredacted(this.deps, this.config, at, 'embed', 'embed', this.inner.model, parts, texts),
    )
    await this.deps.log(logEntry(this.config, prepared.manifest, approval), at.projectPath)
    return this.inner.embed(prepared.body, signal)
  }
}

/** Embedding and media requests: previewed and approved as they are, never redacted (FR-3). */
async function unredacted<T>(
  deps: GateDeps,
  config: ProviderConfig,
  at: Where,
  kind: OutboundKind,
  task: string,
  model: string,
  parts: ManifestPart[],
  body: T,
): Promise<Prepared<T>> {
  const settings = await deps.privacy(at.projectPath)
  const hash = hashRequest(destination(config), { kind, model, body })
  const manifest = buildManifest({
    kind,
    providerId: config.id,
    providerLabel: config.label,
    host: providerHost(config),
    model,
    task,
    review: settings.review,
    requestHash: hash,
    redactable: false,
    parts,
    excerpts: [],
    ...at,
  })
  return { manifest, body, hash }
}

// ---- media ---------------------------------------------------------------------------------

function mediaParts(job: MediaJob): ManifestPart[] {
  const b = job.brief
  const parts: [string, string | undefined][] =
    job.kind === 'image'
      ? [
          ['Image prompt', b.imagePrompt],
          ['Negative prompt', b.negativePrompt],
        ]
      : job.kind === 'video'
        ? [
            ['Video prompt', b.videoPrompt],
            [
              'Input image',
              job.inputImagePath ? 'An image file from this scenario is attached.' : undefined,
            ],
          ]
        : (b.voiceLines ?? []).map((l, i) => [`Voice line ${i + 1} (${l.speaker})`, l.text])
  return parts
    .filter((p): p is [string, string] => !!p[1])
    .map(([name, text]) => ({ name, text, spans: [] }))
}

class GuardedMediaProvider implements MediaProvider {
  constructor(
    private readonly inner: MediaProvider,
    private readonly deps: GateDeps,
  ) {}

  get id(): string {
    return this.inner.id
  }
  get kind() {
    return this.inner.kind
  }
  get config(): ProviderConfig {
    return this.inner.config
  }

  capabilities() {
    return this.inner.capabilities()
  }

  health(signal?: AbortSignal) {
    return this.inner.health(signal)
  }

  async generate(job: MediaJob, onProgress?: (p: MediaProgress) => void): Promise<MediaOutput[]> {
    const at = where(undefined, job.signal)
    const { signal: _s, ...body } = job
    const model = this.config.defaultModel ?? ''
    const { prepared, approval } = await approve(this.deps, this.config, at, () =>
      unredacted(this.deps, this.config, at, 'media', job.kind, model, mediaParts(job), body),
    )
    await this.deps.log(logEntry(this.config, prepared.manifest, approval), at.projectPath)
    return this.inner.generate(
      { ...prepared.body, ...(job.signal ? { signal: job.signal } : {}) },
      onProgress,
    )
  }
}

// ---- wrapping ------------------------------------------------------------------------------

export function guardText(
  provider: TextProvider,
  config: ProviderConfig,
  deps: GateDeps,
): TextProvider {
  return isRemoteProvider(config) ? new GuardedTextProvider(provider, deps) : provider
}

export function guardEmbedding(
  provider: EmbeddingProvider,
  config: ProviderConfig,
  deps: GateDeps,
): EmbeddingProvider {
  return isRemoteProvider(config) ? new GuardedEmbeddingProvider(provider, config, deps) : provider
}

export function guardMedia(
  provider: MediaProvider,
  config: ProviderConfig,
  deps: GateDeps,
): MediaProvider {
  return isRemoteProvider(config) ? new GuardedMediaProvider(provider, deps) : provider
}

/** Whether a provider instance went through the gate (tests, diagnostics). */
export const isGuarded = (p: unknown): boolean =>
  p instanceof GuardedTextProvider ||
  p instanceof GuardedEmbeddingProvider ||
  p instanceof GuardedMediaProvider

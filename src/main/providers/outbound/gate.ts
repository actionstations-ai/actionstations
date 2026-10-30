// The outbound gate (#433): one check point between the app and every cloud provider. Text,
// embedding and media providers are wrapped where they are built (providers/resolve.ts), so no
// adapter changes and every caller is covered. For a local provider nothing is wrapped (NFR-6),
// except Ollama, whose `-cloud` models run on ollama.com: its wrapper passes local models through.
//
// chat(req): redact system, context and messages → build the manifest → ask under the review
// policy (waiting for the user when needed) → check the approved hash against the exact request
// → strip the metadata, call the adapter → restore placeholders in the reply → log the send.
// Media prompts are redacted with plain stand-ins (images and audio cannot be changed back);
// embedding requests are previewed and approved but never redacted (FR-3).
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { extname, resolve } from 'node:path'
import type {
  ApprovalKind,
  CloudSendEntry,
  OutboundKind,
  OutboundManifest,
  PrivacySettings,
  ProviderConfig,
  RedactionCategory,
} from '@shared/schemas'
import {
  OLLAMA_CLOUD_HOST,
  hasCloudModels,
  isCloudModel,
  isRemoteProvider,
  providerHost,
} from '@shared/provider-network'
import { currentJob } from '../../jobs/scope'
import { AppError } from '../../lib/errors'
import { nowIso } from '../../lib/ids'
import { extractJson } from '../json'
import type {
  ChatRequest,
  ChatResponse,
  EmbedMeta,
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
import { redactText, type PlacedSpan, type RedactionRegistry } from './redact'
import { reverseDeep, reverseText } from './reverse'

/** Prepended to the system prompt of a request that carries placeholders. App text: not redacted. */
export const PLACEHOLDER_INSTRUCTION =
  'Some names, phone numbers, emails and addresses are replaced with placeholders like ' +
  '[[PERSON_7F3K]]. Use the placeholders exactly as written wherever you refer to them; never ' +
  'invent new ones.'

/** The fixed text embedders send once to learn their vector size; no project content. */
export const DIMENSION_PROBE = 'dimension probe'

/** What a redacted value becomes in an image, video or voice prompt (it cannot be changed back). */
export const MEDIA_STAND_INS: Record<RedactionCategory, string> = {
  person: 'a staff member',
  phone: 'a phone number',
  email: 'an email address',
  address: 'a street address',
}

/** A request rebuilt this many times (settings kept changing while it waited) gives up. */
const MAX_REBUILDS = 20
/** Input images up to this size are shown in the dialog. */
const MAX_THUMBNAIL_BYTES = 4 * 1024 * 1024

export interface GateDeps {
  approvals: Approvals
  privacy(projectPath?: string): Promise<PrivacySettings>
  context(settings: PrivacySettings, projectPath?: string): Promise<DetectContext>
  registry(projectPath?: string): Promise<RedactionRegistry>
  enabled(settings: PrivacySettings): ReadonlySet<RedactionCategory>
  log(entry: CloudSendEntry, projectPath?: string): Promise<void>
  /** Whether a path from a request scope is a project the user opened (and so may be used). */
  knownProject(path: string): Promise<boolean>
}

interface Where {
  jobId?: string
  projectPath?: string
  signal?: AbortSignal
}

async function where(
  deps: GateDeps,
  meta: Partial<OutboundMeta> | undefined,
  signal?: AbortSignal,
): Promise<Where> {
  const scope = currentJob()
  const jobId = meta?.jobId ?? scope?.jobId
  const given = meta?.projectPath ?? scope?.projectPath
  const projectPath = given && (await deps.knownProject(given)) ? resolve(given) : undefined
  const sig = signal ?? scope?.signal
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
  /** Fingerprints of the request's own content, for the new-excerpts policy. */
  content: string[]
  registry: RedactionRegistry
}

/**
 * Ask (when the policy says so) and return the approval to record, rebuilding the request when
 * settings change while it waits. Returns the hash the approval covers.
 */
async function approve<P extends Prepared<unknown>>(
  deps: GateDeps,
  config: ProviderConfig,
  at: Where,
  prepare: () => Promise<P>,
): Promise<{ prepared: P; approval: ApprovalKind; approvedHash: string }> {
  const scopeKey = scopeKeyFor(config.id, at.jobId, at.projectPath)
  for (let round = 0; round < MAX_REBUILDS; round++) {
    const prepared = await prepare()
    const auth = await deps.approvals.authorize(
      scopeKey,
      prepared.manifest,
      at.signal,
      prepared.content,
    )
    if ('recompute' in auth) continue
    return { prepared, approval: auth.approval, approvedHash: auth.approvedHash }
  }
  throw new AppError('CONFLICT', 'The request kept changing while it waited; it was not sent.')
}

/** Refuse unless the body about to be sent hashes to exactly what was approved (FR-8). */
function assertApproved(approvedHash: string, sentHash: string): void {
  if (approvedHash !== sentHash)
    throw new AppError('CONFLICT', 'The request changed after it was approved; it was not sent.')
}

function logEntry(
  config: ProviderConfig,
  manifest: OutboundManifest,
  approval: ApprovalKind,
  registry: RedactionRegistry,
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
    // Keyed with the project's redaction key: an unsalted hash of a short request could be
    // confirmed by anyone who guesses its text.
    requestHash: registry.mac(manifest.requestHash),
  }
}

const destination = (config: ProviderConfig, host: string) => ({ host, providerId: config.id })

// ---- content fingerprints (new-excerpts policy) -------------------------------------------------

const normalizeLine = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/\s+…$/, '').replace(/\s+/g, ' ').trim()

/** Lines of the retrieved-documents block that only frame the excerpts. */
const FRAME_LINE = /^<\/?documents?\b[^>]*>$/

/**
 * One fingerprint per line of content that is not inside a plan excerpt: earlier stage outputs,
 * facility facts, prompts. A request carrying any line never approved in the job is new.
 */
export function contentHashes(texts: string[], excerpts: { text: string }[]): string[] {
  const covered = excerpts.map((e) => normalizeLine(e.text))
  const out = new Set<string>()
  for (const text of texts)
    for (const raw of text.split('\n')) {
      const line = normalizeLine(raw)
      if (line.length < 3 || FRAME_LINE.test(line)) continue
      if (covered.some((c) => c.includes(line))) continue
      out.add(createHash('sha256').update(line).digest('hex').slice(0, 32))
    }
  return [...out]
}

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

const shift = (spans: PlacedSpan[], by: number): PlacedSpan[] =>
  spans.map((s) => ({ ...s, start: s.start + by, end: s.end + by }))

class GuardedTextProvider implements TextProvider {
  constructor(
    private readonly inner: TextProvider,
    private readonly deps: GateDeps,
    /** Ollama on this computer: only cloud models go through the gate. */
    private readonly perModel = false,
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

  private host(model: string): string {
    return isCloudModel(this.config.kind, model) ? OLLAMA_CLOUD_HOST : providerHost(this.config)
  }

  private async prepare(req: ChatRequest, at: Where): Promise<Prepared<ChatBody>> {
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
    let systemText = system?.text
    let systemSpans = system?.spans ?? []
    if (parts.some((p) => p.spans.length) || systemSpans.length) {
      const prefix = `${PLACEHOLDER_INSTRUCTION}\n\n`
      systemText = prefix + (systemText ?? '')
      systemSpans = shift(systemSpans, prefix.length)
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
    const model = body.model ?? config.defaultModel ?? ''
    const host = this.host(model)
    const hash = hashRequest(destination(config, host), chatHashBody(body))
    const manifest = buildManifest({
      kind: 'chat',
      providerId: config.id,
      providerLabel: config.label,
      host,
      model,
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
    const content = contentHashes(
      parts.map((p) => p.text),
      excerpts,
    )
    return { manifest, body, hash, content, registry }
  }

  async chat(req: ChatRequest, onToken?: (text: string) => void): Promise<ChatResponse> {
    const model = req.model ?? this.config.defaultModel
    if (this.perModel && !isCloudModel(this.config.kind, model))
      return this.inner.chat(req, onToken)
    const at = await where(this.deps, req.outbound, req.signal)
    const { prepared, approval, approvedHash } = await approve(this.deps, this.config, at, () =>
      this.prepare(req, at),
    )
    const sent: ChatRequest = { ...prepared.body, ...(req.signal ? { signal: req.signal } : {}) }
    const host = this.host(sent.model ?? this.config.defaultModel ?? '')
    assertApproved(approvedHash, hashRequest(destination(this.config, host), chatHashBody(sent)))
    await this.deps.log(
      logEntry(this.config, prepared.manifest, approval, prepared.registry),
      at.projectPath,
    )
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
  get remote(): boolean {
    return true
  }
  get model(): string {
    return this.inner.model
  }
  get dims(): number {
    return this.inner.dims
  }

  /**
   * Previewed and approved, not redacted: search over placeholders would not work. One approval
   * covers the job's later batches (open question 5), so their texts are not fingerprinted.
   */
  async embed(texts: string[], signal?: AbortSignal, meta?: EmbedMeta): Promise<Float32Array[]> {
    if (texts.length === 1 && texts[0] === DIMENSION_PROBE) return this.inner.embed(texts, signal)
    const at = await where(this.deps, undefined, signal)
    const host = isCloudModel(this.config.kind, this.inner.model)
      ? OLLAMA_CLOUD_HOST
      : providerHost(this.config)
    const prepare = async (): Promise<Prepared<string[]>> => {
      const settings = await this.deps.privacy(at.projectPath)
      const registry = await this.deps.registry(at.projectPath)
      const hash = hashRequest(destination(this.config, host), {
        kind: 'embed',
        model: this.inner.model,
        body: texts,
      })
      const manifest = buildManifest({
        ...base(this.config, host, 'embed', 'embed', this.inner.model, settings, hash, at),
        redactable: false,
        parts: texts.map((t, i) => ({ name: `Text ${i + 1}`, text: t, spans: [] })),
        excerpts: [],
        sources: countSources(meta?.documentTitles),
      })
      return { manifest, body: texts, hash, content: [], registry }
    }
    const { prepared, approval, approvedHash } = await approve(this.deps, this.config, at, prepare)
    assertApproved(
      approvedHash,
      hashRequest(destination(this.config, host), {
        kind: 'embed',
        model: this.inner.model,
        body: prepared.body,
      }),
    )
    await this.deps.log(
      logEntry(this.config, prepared.manifest, approval, prepared.registry),
      at.projectPath,
    )
    return this.inner.embed(prepared.body, signal)
  }
}

/** Passages per document title, in the order the titles first appear. */
export function countSources(titles?: string[]): { title: string; passages: number }[] {
  const counts = new Map<string, number>()
  for (const t of titles ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts].map(([title, passages]) => ({ title, passages }))
}

function base(
  config: ProviderConfig,
  host: string,
  kind: OutboundKind,
  task: string,
  model: string,
  settings: PrivacySettings,
  hash: string,
  at: Where,
) {
  return {
    kind,
    providerId: config.id,
    providerLabel: config.label,
    host,
    model,
    task,
    review: settings.review,
    requestHash: hash,
    ...at,
  }
}

// ---- media ---------------------------------------------------------------------------------

/** Replace detected values with plain stand-ins; spans index the result. */
function standIns(
  text: string,
  redact: (t: string) => { text: string; spans: PlacedSpan[] },
): { text: string; spans: PlacedSpan[] } {
  const r = redact(text)
  let out = ''
  let at = 0
  const spans: PlacedSpan[] = []
  for (const s of r.spans) {
    out += r.text.slice(at, s.start)
    const word = MEDIA_STAND_INS[s.category]
    spans.push({ ...s, placeholder: word, start: out.length, end: out.length + word.length })
    out += word
    at = s.end
  }
  return { text: out + r.text.slice(at), spans }
}

/** The free-text fields a media request sends, redacted with stand-ins. */
function redactBrief(
  job: Omit<MediaJob, 'signal'>,
  redact: (t: string) => { text: string; spans: PlacedSpan[] },
): { body: Omit<MediaJob, 'signal'>; parts: ManifestPart[] } {
  const b = job.brief
  const parts: ManifestPart[] = []
  const field = (name: string, value: string | undefined): string | undefined => {
    if (value === undefined) return undefined
    const r = standIns(value, redact)
    if (r.text) parts.push({ name, text: r.text, spans: r.spans })
    return r.text
  }
  const brief = { ...b }
  if (job.kind === 'image') {
    brief.imagePrompt = field('Image prompt', b.imagePrompt)
    brief.negativePrompt = field('Negative prompt', b.negativePrompt)
  } else if (job.kind === 'video') {
    brief.videoPrompt = field('Video prompt', b.videoPrompt)
  }
  if (b.voiceLines)
    brief.voiceLines = b.voiceLines.map((l, i) => ({
      ...l,
      text: field(`Voice line ${i + 1}`, l.text) ?? '',
    }))
  for (const k of Object.keys(brief) as (keyof typeof brief)[])
    if (brief[k] === undefined) delete brief[k]
  return { body: { ...job, brief }, parts }
}

async function inputImage(
  path: string | undefined,
): Promise<{ digest?: string; images: { name: string; dataUrl: string }[] }> {
  if (!path) return { images: [] }
  const bytes = await fs.readFile(path)
  const digest = createHash('sha256').update(bytes).digest('hex')
  const ext = extname(path).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  const images =
    bytes.length <= MAX_THUMBNAIL_BYTES
      ? [{ name: 'Input image', dataUrl: `data:${mime};base64,${bytes.toString('base64')}` }]
      : []
  return { digest, images }
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

  private async prepare(job: MediaJob, at: Where): Promise<Prepared<Omit<MediaJob, 'signal'>>> {
    const { signal: _s, ...raw } = job
    const settings = await this.deps.privacy(at.projectPath)
    const enabled = this.deps.enabled(settings)
    const ctx = await this.deps.context(settings, at.projectPath)
    const registry = await this.deps.registry(at.projectPath)
    const { body, parts } = redactBrief(raw, (t) => redactText(t, enabled, ctx, registry))
    const { digest, images } = await inputImage(job.inputImagePath)
    const host = providerHost(this.config)
    const model = this.config.defaultModel ?? ''
    const hash = mediaHash(this.config, host, model, body, digest)
    const manifest = buildManifest({
      ...base(this.config, host, 'media', job.kind, model, settings, hash, at),
      redactable: true,
      parts,
      excerpts: [],
      images,
    })
    const content = contentHashes(
      [...parts.map((p) => p.text), ...(digest ? [`input image ${digest}`] : [])],
      [],
    )
    return { manifest, body, hash, content, registry }
  }

  async generate(job: MediaJob, onProgress?: (p: MediaProgress) => void): Promise<MediaOutput[]> {
    const at = await where(this.deps, undefined, job.signal)
    const { prepared, approval, approvedHash } = await approve(this.deps, this.config, at, () =>
      this.prepare(job, at),
    )
    const { digest } = await inputImage(prepared.body.inputImagePath)
    const model = this.config.defaultModel ?? ''
    const host = providerHost(this.config)
    assertApproved(approvedHash, mediaHash(this.config, host, model, prepared.body, digest))
    await this.deps.log(
      logEntry(this.config, prepared.manifest, approval, prepared.registry),
      at.projectPath,
    )
    return this.inner.generate(
      { ...prepared.body, ...(job.signal ? { signal: job.signal } : {}) },
      onProgress,
    )
  }
}

/** The media request as sent: the prompts and the bytes of any input image (not its path). */
function mediaHash(
  config: ProviderConfig,
  host: string,
  model: string,
  body: Omit<MediaJob, 'signal'>,
  imageDigest: string | undefined,
): string {
  const { outDir: _out, inputImagePath: _path, ...sent } = body
  return hashRequest(destination(config, host), {
    kind: 'media',
    model,
    body: sent,
    inputImage: imageDigest,
  })
}

// ---- wrapping ------------------------------------------------------------------------------

export function guardText(
  provider: TextProvider,
  config: ProviderConfig,
  deps: GateDeps,
): TextProvider {
  if (isRemoteProvider(config)) return new GuardedTextProvider(provider, deps)
  return hasCloudModels(config.kind) ? new GuardedTextProvider(provider, deps, true) : provider
}

export function guardEmbedding(
  provider: EmbeddingProvider,
  config: ProviderConfig,
  deps: GateDeps,
): EmbeddingProvider {
  return isRemoteProvider(config) || isCloudModel(config.kind, provider.model)
    ? new GuardedEmbeddingProvider(provider, config, deps)
    : provider
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

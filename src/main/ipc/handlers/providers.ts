// Provider settings (#21) and task routing (#22). Configs live in settings.json; API keys
// live only in secrets (safeStorage) and never cross back to the renderer.
import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProviderView, type ProviderConfig, type ProviderHealth } from '@shared/schemas'
import { defineHandlers } from '../registry'
import { AppError } from '../../lib/errors'
import { requireProject } from '../../project/guard'
import { updateProject } from '../../project/store'
import { getSecret, hasSecret, setSecret } from '../../secrets'
import { getSettings, updateSettings } from '../../settings/store'
import { adapterFor } from '../../providers/registry'
import { detectLocalServices } from '../../providers/local-detect'
import { canPullModels, pullProviderModel, type PullProgress } from '../../providers/model-pull'
import { jobs } from '../../jobs/manager'
import {
  assertRoutingTargetsExist,
  configFor,
  ensureMockProviders,
  forgetProvider,
  getRoutingView,
  mediaProviderFor,
  textProviderFor,
} from '../../providers/resolve'

const HEALTH_TIMEOUT_MS = 10_000
const TEST_TIMEOUT_MS = 60_000
const TEST_PROMPT = 'Reply with the single word OK'
const BASE_URL_REQUIRED = new Set<ProviderConfig['kind']>([
  'openai-compatible',
  'ollama',
  'comfyui',
])
const KEYLIKE_OPTION = /key|token|secret|password|authorization/i

async function toView(config: ProviderConfig): Promise<ProviderView> {
  return ProviderView.parse({ ...config, hasKey: await hasSecret(config.id) })
}

/** "LM Studio" → "lm-studio-3f9a": readable, unique enough, always a SafeId. */
export function newProviderId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${slug || 'provider'}-${randomBytes(2).toString('hex')}`
}

function validateConfig(config: Omit<ProviderConfig, 'id'>): void {
  if (BASE_URL_REQUIRED.has(config.kind) && !config.baseUrl)
    throw new AppError('VALIDATION', `A base URL is required for ${config.kind} providers`)
  const keyLike = Object.keys(config.options).find((k) => KEYLIKE_OPTION.test(k))
  if (keyLike)
    throw new AppError(
      'VALIDATION',
      `Option "${keyLike}" looks like a credential. Put API keys in the key field; options are stored in plain text.`,
    )
}

/** Remove the key from any message an adapter surfaces, in case it echoes request details. */
function redact(message: string, secret: string | undefined): string {
  return secret ? message.split(secret).join('••••') : message
}

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))

async function checkHealth(config: ProviderConfig): Promise<ProviderHealth> {
  const started = Date.now()
  try {
    const adapter = adapterFor(config.kind)
    const signal = AbortSignal.timeout(HEALTH_TIMEOUT_MS)
    const health = adapter.createText
      ? await (await textProviderFor(config)).health(signal)
      : await (await mediaProviderFor(config)).health(signal)
    return { ...health, latencyMs: health.latencyMs ?? Date.now() - started }
  } catch (e) {
    const message = redact(errorMessage(e), await getSecret(config.id).catch(() => undefined))
    return { ok: false, latencyMs: Date.now() - started, message }
  }
}

async function runTest(config: ProviderConfig, model: string | undefined) {
  const started = Date.now()
  try {
    const provider = await textProviderFor(config)
    const signal = AbortSignal.timeout(TEST_TIMEOUT_MS)
    const chosen = model ?? config.defaultModel ?? (await provider.listModels(signal))[0]?.id
    const res = await provider.chat({
      ...(chosen ? { model: chosen } : {}),
      messages: [{ role: 'user', content: TEST_PROMPT }],
      maxTokens: 8,
      temperature: 0,
      signal,
    })
    return { ok: true, sample: res.text.trim().slice(0, 200), latencyMs: Date.now() - started }
  } catch (e) {
    const error = redact(errorMessage(e), await getSecret(config.id).catch(() => undefined))
    return { ok: false, latencyMs: Date.now() - started, error }
  }
}

const SPEECH_TIMEOUT_MS = 120_000
const SPEECH_MAX_CHARS = 200
const SPEECH_SAMPLE =
  'This is a test of the exercise voice. All flights from Concourse A are delayed.'

/** Synthesize one line into a temp dir (never a project) and return it as a data URL. */
async function runSpeechTest(config: ProviderConfig, text?: string, voiceStyle?: string) {
  const started = Date.now()
  const outDir = await fs.mkdtemp(join(tmpdir(), 'ttx-speech-'))
  try {
    const provider = await mediaProviderFor(config)
    if (!provider.capabilities().has('audio'))
      throw new AppError('VALIDATION', `${config.label} does not generate speech`)
    const line = (text?.trim() || SPEECH_SAMPLE).slice(0, SPEECH_MAX_CHARS)
    const [out] = await provider.generate({
      kind: 'audio',
      injectId: 'speech-test',
      brief: {
        paths: ['tts'],
        voiceLines: [{ speaker: 'Test', voiceStyle: voiceStyle ?? '', text: line }],
      },
      outDir,
      signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
    })
    if (!out) throw new AppError('PROVIDER', 'The provider returned no audio')
    const audio = await fs.readFile(out.filePath)
    return {
      ok: true,
      dataUrl: `data:${out.mimeType};base64,${audio.toString('base64')}`,
      ...(out.durationSec !== undefined ? { durationSec: out.durationSec } : {}),
      latencyMs: Date.now() - started,
    }
  } catch (e) {
    const error = redact(errorMessage(e), await getSecret(config.id).catch(() => undefined))
    return { ok: false, latencyMs: Date.now() - started, error }
  } finally {
    await fs.rm(outDir, { recursive: true, force: true })
  }
}

const PULL_JOB_KIND = 'model-pull' as const

/** "pulling 3f9a…: 1.2 / 4.7 GB" — Ollama reports bytes per layer. */
export function pullProgressMessage(model: string, p: PullProgress): string {
  if (p.total && p.completed !== undefined) {
    const gb = (n: number): string => (n / 1e9).toFixed(2)
    return `${model}: ${p.status} ${gb(p.completed)} / ${gb(p.total)} GB`
  }
  return `${model}: ${p.status}`
}

function activePull(providerId: string, model: string): string | undefined {
  return jobs.list({ activeOnly: true }).find((j) => {
    const payload = j.payload as { providerId?: string; model?: string } | undefined
    const live = j.status === 'queued' || j.status === 'running'
    return (
      live &&
      j.kind === PULL_JOB_KIND &&
      payload?.providerId === providerId &&
      payload.model === model
    )
  })?.id
}

async function startPull(id: string, model: string): Promise<{ jobId: string }> {
  const config = await configFor(id)
  if (!canPullModels(config.kind))
    throw new AppError('VALIDATION', `Model pull is only available for Ollama providers`)
  const running = activePull(id, model)
  if (running) return { jobId: running }
  const job = jobs.start(
    PULL_JOB_KIND,
    async (ctx) => {
      ctx.progress(0, `Pulling ${model}`)
      await pullProviderModel(
        config,
        model,
        (p) => ctx.progress(p.fraction ?? 0, pullProgressMessage(model, p)),
        ctx.signal,
      )
      ctx.log(`Pulled ${model} into ${config.label}`)
      forgetProvider(id)
      return { providerId: id, model }
    },
    { payload: { providerId: id, model } },
  )
  return { jobId: job.id }
}

export default defineHandlers({
  'providers:list': async () => {
    await ensureMockProviders()
    const { providers } = await getSettings()
    return Promise.all(providers.map(toView))
  },

  'providers:upsert': async ({ config, apiKey }) => {
    validateConfig(config)
    const existing = config.id
      ? (await getSettings()).providers.find((p) => p.id === config.id)
      : undefined
    const id = existing?.id ?? config.id ?? newProviderId(config.label)
    // Store the key first: if secure storage refuses, nothing half-saved remains.
    if (apiKey !== undefined) await setSecret(id, apiKey)
    const next: ProviderConfig = { ...config, id }
    await updateSettings((s) => {
      const i = s.providers.findIndex((p) => p.id === id)
      if (i >= 0) s.providers[i] = next
      else s.providers.push(next)
    })
    forgetProvider(id)
    return toView(next)
  },

  'providers:remove': async ({ id }) => {
    await configFor(id)
    await updateSettings((s) => {
      s.providers = s.providers.filter((p) => p.id !== id)
      for (const [task, ref] of Object.entries(s.defaultRouting))
        if (ref?.providerId === id) delete s.defaultRouting[task as keyof typeof s.defaultRouting]
      if (s.embeddings.providerId === id) delete s.embeddings.providerId
    })
    await setSecret(id, null)
    forgetProvider(id)
  },

  'providers:health': async ({ id }) => checkHealth(await configFor(id)),

  'providers:models': async ({ id }) => {
    const config = await configFor(id)
    if (!adapterFor(config.kind).createText) return []
    const provider = await textProviderFor(config)
    try {
      return await provider.listModels(AbortSignal.timeout(HEALTH_TIMEOUT_MS))
    } catch (e) {
      const secret = await getSecret(id).catch(() => undefined)
      throw new AppError('PROVIDER', `Could not list models: ${redact(errorMessage(e), secret)}`)
    }
  },

  'providers:test': async ({ id, model }) => runTest(await configFor(id), model),

  'providers:detect-local': () => detectLocalServices(),

  'providers:pull-model': ({ id, model }) => startPull(id, model),

  'providers:test-speech': async ({ id, text, voiceStyle }) =>
    runSpeechTest(await configFor(id), text, voiceStyle),

  'routing:get': async ({ projectPath }) => {
    const root = projectPath ? await requireProject(projectPath) : undefined
    return getRoutingView(root)
  },

  'routing:set': async ({ scope, projectPath, routing }) => {
    const root = projectPath ? await requireProject(projectPath) : undefined
    assertRoutingTargetsExist(routing, await getSettings())
    if (scope === 'global') {
      await updateSettings((s) => {
        s.defaultRouting = routing
      })
    } else {
      if (!root) throw new AppError('VALIDATION', 'projectPath is required for project routing')
      await updateProject(root, (p) => {
        p.providerRouting = routing
      })
    }
    return getRoutingView(root)
  },
})

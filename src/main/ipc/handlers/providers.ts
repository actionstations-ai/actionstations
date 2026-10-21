// Provider settings (#21) and task routing (#22). Configs live in settings.json; API keys
// live only in secrets (safeStorage) and never cross back to the renderer.
import { randomBytes } from 'node:crypto'
import { ProviderView, type ProviderConfig, type ProviderHealth } from '@shared/schemas'
import { defineHandlers } from '../registry'
import { AppError } from '../../lib/errors'
import { requireProject } from '../../project/guard'
import { updateProject } from '../../project/store'
import { getSecret, hasSecret, setSecret } from '../../secrets'
import { getSettings, updateSettings } from '../../settings/store'
import { adapterFor } from '../../providers/registry'
import { detectLocalServices } from '../../providers/local-detect'
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

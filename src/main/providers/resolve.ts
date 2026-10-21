// Task → provider resolution (#22). Effective routing = project.providerRouting over
// settings.defaultRouting, per task. Provider instances are cached by id + config + key hash.
import { createHash } from 'node:crypto'
import {
  PROVIDER_TASKS,
  type AppSettings,
  type ProviderConfig,
  type ProviderRef,
  type ProviderRouting,
  type ProviderTask,
} from '@shared/schemas'
import { AppError } from '../lib/errors'
import { loadProject } from '../project/store'
import { getSecret } from '../secrets'
import { getSettings, updateSettings } from '../settings/store'
import { createEmbeddingProvider, createMediaProvider, createTextProvider } from './registry'
import type { EmbeddingProvider, MediaProvider, TextProvider } from './types'

export type TextTask = Extract<ProviderTask, 'ideate' | 'draft' | 'critique'>
export type MediaTask = Extract<ProviderTask, 'image' | 'video' | 'audio'>

export interface ResolvedText {
  provider: TextProvider
  model: string
  providerId: string
}

export interface ResolvedMedia {
  provider: MediaProvider
  providerId: string
  model?: string
}

export interface RoutingView {
  global: ProviderRouting
  project?: ProviderRouting
  effective: ProviderRouting
}

/** Kinds that cannot work without an API key. */
const KEY_REQUIRED_KINDS = new Set<ProviderConfig['kind']>(['anthropic'])

// ---- mock seeding (dev / e2e) ------------------------------------------------------------

export const MOCK_PROVIDER_ID = 'mock'
let mockSeeded = false

/**
 * With TTX_MOCK_PROVIDERS=1, make sure a 'mock' provider exists and, if no routing is set,
 * route every task to it — so e2e and the pipeline run offline. Runs once per process.
 */
export async function ensureMockProviders(): Promise<void> {
  if (process.env.TTX_MOCK_PROVIDERS !== '1' || mockSeeded) return
  mockSeeded = true
  await updateSettings((s) => {
    if (!s.providers.some((p) => p.id === MOCK_PROVIDER_ID)) {
      s.providers.push({
        id: MOCK_PROVIDER_ID,
        kind: 'mock',
        label: 'Mock (offline)',
        defaultModel: 'mock-large',
        options: {},
        enabled: true,
      })
    }
    if (Object.keys(s.defaultRouting).length === 0) {
      s.defaultRouting = Object.fromEntries(
        PROVIDER_TASKS.map((t) => [t, { providerId: MOCK_PROVIDER_ID }]),
      )
    }
  })
}

/** Tests only. */
export function resetResolveState(): void {
  mockSeeded = false
  instances.clear()
}

// ---- routing -----------------------------------------------------------------------------

/** Project entries win over global ones, task by task. */
export function mergeRouting(global: ProviderRouting, project?: ProviderRouting): ProviderRouting {
  return { ...global, ...(project ?? {}) }
}

/** Global, project (when a path is given) and effective routing. Caller guards the path. */
export async function getRoutingView(projectPath?: string): Promise<RoutingView> {
  await ensureMockProviders()
  const global = (await getSettings()).defaultRouting
  if (!projectPath) return { global, effective: global }
  const project = (await loadProject(projectPath)).providerRouting
  return { global, project, effective: mergeRouting(global, project) }
}

/** Every providerId referenced by a routing table must exist in settings. */
export function assertRoutingTargetsExist(routing: ProviderRouting, settings: AppSettings): void {
  const ids = new Set(settings.providers.map((p) => p.id))
  for (const [task, ref] of Object.entries(routing)) {
    if (ref && !ids.has(ref.providerId))
      throw new AppError('VALIDATION', `Unknown provider "${ref.providerId}" for '${task}'`)
  }
}

// ---- provider lookup ---------------------------------------------------------------------

async function refFor(task: ProviderTask, projectPath?: string): Promise<ProviderRef> {
  const ref = (await getRoutingView(projectPath)).effective[task]
  if (!ref)
    throw new AppError(
      'VALIDATION',
      `No provider is assigned to '${task}'. Assign one in Providers → Routing.`,
    )
  return ref
}

/** The stored config for an id, or a clear error naming the task that needs it. */
export async function configFor(providerId: string, task?: ProviderTask): Promise<ProviderConfig> {
  const config = (await getSettings()).providers.find((p) => p.id === providerId)
  const forTask = task ? ` assigned to '${task}'` : ''
  if (!config)
    throw new AppError(
      'VALIDATION',
      `The provider${forTask} ("${providerId}") no longer exists. Pick another in Providers → Routing.`,
    )
  if (task && !config.enabled)
    throw new AppError(
      'VALIDATION',
      `Provider "${config.label}"${forTask} is disabled. Enable it in Providers or assign another.`,
    )
  return config
}

async function secretFor(config: ProviderConfig): Promise<string | undefined> {
  const secret = await getSecret(config.id)
  if (!secret && KEY_REQUIRED_KINDS.has(config.kind))
    throw new AppError('VALIDATION', `"${config.label}" needs an API key. Add one in Providers.`)
  return secret
}

const instances = new Map<string, unknown>()

const hash = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16)

function cached<T>(
  area: string,
  config: ProviderConfig,
  secret: string | undefined,
  make: () => T,
): T {
  const key = `${config.id}\u0000${area}\u0000${hash(JSON.stringify(config))}\u0000${hash(secret ?? '')}`
  if (!instances.has(key)) instances.set(key, make())
  return instances.get(key) as T
}

/** Drop cached instances for a provider (after edit / remove / key change). */
export function forgetProvider(providerId: string): void {
  for (const key of instances.keys())
    if (key.startsWith(`${providerId}\u0000`)) instances.delete(key)
}

export async function textProviderFor(config: ProviderConfig): Promise<TextProvider> {
  const secret = await secretFor(config)
  return cached('text', config, secret, () => createTextProvider(config, secret))
}

export async function mediaProviderFor(config: ProviderConfig): Promise<MediaProvider> {
  const secret = await secretFor(config)
  return cached('media', config, secret, () => createMediaProvider(config, secret))
}

function modelFor(task: ProviderTask, ref: ProviderRef, config: ProviderConfig): string {
  const model = ref.model ?? config.defaultModel
  if (!model)
    throw new AppError(
      'VALIDATION',
      `No model is chosen for '${task}' on "${config.label}". Pick one in Providers → Routing or set a default model.`,
    )
  return model
}

// ---- public resolution -------------------------------------------------------------------

export async function resolveTextProvider(
  task: TextTask,
  projectPath?: string,
): Promise<ResolvedText> {
  const ref = await refFor(task, projectPath)
  const config = await configFor(ref.providerId, task)
  const model = modelFor(task, ref, config)
  return { provider: await textProviderFor(config), model, providerId: config.id }
}

export async function resolveMediaProvider(
  task: MediaTask,
  projectPath?: string,
): Promise<ResolvedMedia> {
  const ref = await refFor(task, projectPath)
  const config = await configFor(ref.providerId, task)
  const model = ref.model ?? config.defaultModel
  return {
    provider: await mediaProviderFor(config),
    providerId: config.id,
    ...(model ? { model } : {}),
  }
}

export async function resolveEmbeddingProvider(
  projectPath?: string,
): Promise<{ provider: EmbeddingProvider; providerId: string; model: string }> {
  const ref = await refFor('embed', projectPath)
  const config = await configFor(ref.providerId, 'embed')
  const model = modelFor('embed', ref, config)
  const secret = await secretFor(config)
  const provider = cached(`embed-${model}`, config, secret, () =>
    createEmbeddingProvider(config, model, secret),
  )
  return { provider, providerId: config.id, model }
}

export type { EmbeddingProvider }

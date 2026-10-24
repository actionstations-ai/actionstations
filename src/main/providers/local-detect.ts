// Probe well-known localhost services (LM Studio, Ollama, ComfyUI on 8188 or 8000) so the Providers page can
// offer one-click setup. Only runs when the user presses "Detect local services"; only ever
// talks to 127.0.0.1.
import type { ProviderKind } from '@shared/schemas'
import { looksLikeEmbeddingModel } from '@shared/model-names'
import { chatModelsBySize, classifyOllamaTags } from './text/ollama/models'

export interface LocalService {
  kind: ProviderKind
  label: string
  baseUrl: string
  reachable: boolean
  models: string[]
  /** Models loaded in memory right now (LM Studio only). */
  loadedModels: string[]
  /** Models that can chat, best default first (never embedding models). */
  chatModels: string[]
}

interface Details {
  loaded: string[]
  /** Models the server says are embedding-only. */
  embedding: string[]
}

interface Probe {
  kind: ProviderKind
  label: string
  baseUrl: string
  probeUrl: string
  models: (body: unknown) => string[]
  /** Optional second probe that reports loaded models and model types. */
  details?: { url: string; parse: (body: unknown) => Details }
  /** Tried in order when `probeUrl` does not answer (ComfyUI Desktop serves on 8000). */
  fallbacks?: { baseUrl: string; probeUrl: string }[]
  /** Chat models from the probe body, best first; `getJson` reaches the same server. */
  chat?: (
    body: unknown,
    getJson: (url: string, body?: unknown) => Promise<unknown>,
  ) => Promise<string[]>
}

const PROBE_TIMEOUT_MS = 800

const strings = (list: unknown, key: string): string[] =>
  Array.isArray(list)
    ? list
        .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>)[key] : undefined))
        .filter((v): v is string => typeof v === 'string')
    : []

export const LOCAL_PROBES: Probe[] = [
  {
    kind: 'openai-compatible',
    label: 'LM Studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    probeUrl: 'http://127.0.0.1:1234/v1/models',
    models: (b) => strings((b as { data?: unknown })?.data, 'id'),
    details: {
      // LM Studio's REST API marks each model state ('loaded' | 'not-loaded') and type
      // ('llm' | 'vlm' | 'embeddings').
      url: 'http://127.0.0.1:1234/api/v0/models',
      parse: (b) => {
        const data = (b as { data?: unknown })?.data
        const rows = Array.isArray(data) ? (data as { state?: unknown; type?: unknown }[]) : []
        return {
          loaded: strings(
            rows.filter((m) => m?.state === 'loaded'),
            'id',
          ),
          embedding: strings(
            rows.filter((m) => m?.type === 'embeddings'),
            'id',
          ),
        }
      },
    },
  },
  {
    kind: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434',
    probeUrl: 'http://127.0.0.1:11434/api/tags',
    models: (b) => strings((b as { models?: unknown })?.models, 'name'),
    // Capabilities from /api/tags, or /api/show per model on older servers (#225).
    chat: async (body, get) =>
      chatModelsBySize(
        await classifyOllamaTags(body, async (name) => {
          const shown = (await get('http://127.0.0.1:11434/api/show', { model: name })) as {
            capabilities?: unknown
          } | null
          return shown?.capabilities
        }),
      ),
  },
  {
    kind: 'comfyui',
    label: 'ComfyUI',
    baseUrl: 'http://127.0.0.1:8188',
    probeUrl: 'http://127.0.0.1:8188/system_stats',
    // ComfyUI Desktop's default port (Comfy-Org/desktop DEFAULT_SERVER_ARGS); a source or
    // portable install uses 8188 (#334).
    fallbacks: [
      { baseUrl: 'http://127.0.0.1:8000', probeUrl: 'http://127.0.0.1:8000/system_stats' },
    ],
    models: () => [],
  },
]

async function getJson(url: string, fetchImpl: typeof fetch, body?: unknown): Promise<unknown> {
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json().catch(() => null)
}

const NO_DETAILS: Details = { loaded: [], embedding: [] }

async function details(p: Probe, fetchImpl: typeof fetch): Promise<Details> {
  if (!p.details) return NO_DETAILS
  try {
    const d = p.details.parse(await getJson(p.details.url, fetchImpl))
    return { loaded: d.loaded.sort(), embedding: d.embedding }
  } catch {
    return NO_DETAILS
  }
}

async function chatModels(
  p: Probe,
  body: unknown,
  models: string[],
  info: Details,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  const byName = models.filter((m) => !info.embedding.includes(m) && !looksLikeEmbeddingModel(m))
  if (!p.chat) return byName
  try {
    return await p.chat(body, (url, b) => getJson(url, fetchImpl, b))
  } catch {
    return byName
  }
}

/** The primary address, else the first fallback that answers; down when none does. */
async function probe(p: Probe, fetchImpl: typeof fetch): Promise<LocalService> {
  const first = await probeAt(p, fetchImpl)
  if (first.reachable) return first
  for (const alt of p.fallbacks ?? []) {
    const found = await probeAt({ ...p, ...alt, fallbacks: [] }, fetchImpl)
    if (found.reachable) return found
  }
  return first
}

async function probeAt(p: Probe, fetchImpl: typeof fetch): Promise<LocalService> {
  const base = { kind: p.kind, label: p.label, baseUrl: p.baseUrl }
  const down = { ...base, reachable: false, models: [], loadedModels: [], chatModels: [] }
  try {
    const [body, info] = await Promise.all([getJson(p.probeUrl, fetchImpl), details(p, fetchImpl)])
    const models = p.models(body).sort()
    const chat = await chatModels(p, body, models, info, fetchImpl)
    return { ...base, reachable: true, models, loadedModels: info.loaded, chatModels: chat }
  } catch {
    return down
  }
}

/** Probe all known local services in parallel; each request has an 800 ms budget. */
export function detectLocalServices(fetchImpl: typeof fetch = fetch): Promise<LocalService[]> {
  return Promise.all(LOCAL_PROBES.map((p) => probe(p, fetchImpl)))
}

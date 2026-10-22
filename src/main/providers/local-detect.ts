// Probe well-known localhost services (LM Studio, Ollama, ComfyUI) so the Providers page can
// offer one-click setup. Only runs when the user presses "Detect local services"; only ever
// talks to 127.0.0.1.
import type { ProviderKind } from '@shared/schemas'

export interface LocalService {
  kind: ProviderKind
  label: string
  baseUrl: string
  reachable: boolean
  models: string[]
  /** Models loaded in memory right now (LM Studio only). */
  loadedModels: string[]
}

interface Probe {
  kind: ProviderKind
  label: string
  baseUrl: string
  probeUrl: string
  models: (body: unknown) => string[]
  /** Optional second probe that lists which models are loaded. */
  loaded?: { url: string; models: (body: unknown) => string[] }
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
    loaded: {
      // LM Studio's REST API marks each model state: 'loaded' | 'not-loaded'.
      url: 'http://127.0.0.1:1234/api/v0/models',
      models: (b) => {
        const data = (b as { data?: unknown })?.data
        const rows = Array.isArray(data) ? (data as { state?: unknown }[]) : []
        return strings(
          rows.filter((m) => m?.state === 'loaded'),
          'id',
        )
      },
    },
  },
  {
    kind: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434',
    probeUrl: 'http://127.0.0.1:11434/api/tags',
    models: (b) => strings((b as { models?: unknown })?.models, 'name'),
  },
  {
    kind: 'comfyui',
    label: 'ComfyUI',
    baseUrl: 'http://127.0.0.1:8188',
    probeUrl: 'http://127.0.0.1:8188/system_stats',
    models: () => [],
  },
]

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json().catch(() => null)
}

async function loadedModels(p: Probe, fetchImpl: typeof fetch): Promise<string[]> {
  if (!p.loaded) return []
  try {
    return p.loaded.models(await getJson(p.loaded.url, fetchImpl)).sort()
  } catch {
    return []
  }
}

async function probe(p: Probe, fetchImpl: typeof fetch): Promise<LocalService> {
  const base = { kind: p.kind, label: p.label, baseUrl: p.baseUrl }
  const down = { ...base, reachable: false, models: [], loadedModels: [] }
  try {
    const [body, loaded] = await Promise.all([
      getJson(p.probeUrl, fetchImpl),
      loadedModels(p, fetchImpl),
    ])
    return { ...base, reachable: true, models: p.models(body).sort(), loadedModels: loaded }
  } catch {
    return down
  }
}

/** Probe all known local services in parallel; each has an 800 ms budget. */
export function detectLocalServices(fetchImpl: typeof fetch = fetch): Promise<LocalService[]> {
  return Promise.all(LOCAL_PROBES.map((p) => probe(p, fetchImpl)))
}

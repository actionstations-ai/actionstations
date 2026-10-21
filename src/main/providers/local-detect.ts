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
}

interface Probe {
  kind: ProviderKind
  label: string
  baseUrl: string
  probeUrl: string
  models: (body: unknown) => string[]
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

async function probe(p: Probe, fetchImpl: typeof fetch): Promise<LocalService> {
  const base = { kind: p.kind, label: p.label, baseUrl: p.baseUrl }
  try {
    const res = await fetchImpl(p.probeUrl, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    if (!res.ok) return { ...base, reachable: false, models: [] }
    const body: unknown = await res.json().catch(() => null)
    return { ...base, reachable: true, models: p.models(body).sort() }
  } catch {
    return { ...base, reachable: false, models: [] }
  }
}

/** Probe all known local services in parallel; each has an 800 ms budget. */
export function detectLocalServices(fetchImpl: typeof fetch = fetch): Promise<LocalService[]> {
  return Promise.all(LOCAL_PROBES.map((p) => probe(p, fetchImpl)))
}

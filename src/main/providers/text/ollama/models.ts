// Which Ollama models can chat: capabilities from /api/tags (recent servers) or /api/show
// (older ones), with a name-based fallback. Pure, so local detection can reuse it (#225).
import type { ModelInfo } from '@shared/schemas'
import { guessModelKind } from '../common'

interface OllamaTag {
  name: string
  size?: number
  details?: { family?: string }
  capabilities?: unknown
}

const capabilityList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : undefined

/** completion → chat, embedding-only → embedding; no report → guess from the name. */
export function ollamaModelKind(name: string, capabilities: unknown): ModelInfo['kind'] {
  const caps = capabilityList(capabilities)
  if (!caps?.length) return guessModelKind(name)
  if (caps.includes('completion')) return 'chat'
  return caps.includes('embedding') ? 'embedding' : 'unknown'
}

/**
 * Turn an /api/tags body into model infos. Recent Ollama lists capabilities in /api/tags;
 * older servers need one /api/show per model (`show`). A failed lookup falls back to the name.
 */
export async function classifyOllamaTags(
  body: unknown,
  show: (name: string) => Promise<unknown>,
): Promise<ModelInfo[]> {
  const raw = (body as { models?: unknown } | null)?.models
  const tags = (Array.isArray(raw) ? raw : []).filter(
    (m): m is OllamaTag => !!m && typeof (m as OllamaTag).name === 'string',
  )
  return Promise.all(
    tags.map(async (m) => {
      const caps = capabilityList(m.capabilities) ?? (await show(m.name).catch(() => undefined))
      const kind = capabilityList(caps)?.length
        ? ollamaModelKind(m.name, caps)
        : guessModelKind(`${m.name} ${m.details?.family ?? ''}`)
      return { id: m.name, kind, ...(typeof m.size === 'number' ? { sizeBytes: m.size } : {}) }
    }),
  )
}

/** Chat models, largest first (the most capable default), from classified model infos. */
export function chatModelsBySize(models: ModelInfo[]): string[] {
  return models
    .filter((m) => m.kind === 'chat')
    .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0) || a.id.localeCompare(b.id))
    .map((m) => m.id)
}

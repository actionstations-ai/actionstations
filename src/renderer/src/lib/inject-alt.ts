// Text alternatives for rendered inject media (#49): the inject title and its type, so a
// screen-reader user hears "Gate B4 shows Miami — FIDS board" rather than "Inject".
import { INJECT_TYPES } from '@shared/taxonomy'

export function injectTypeLabel(type: string | undefined): string | undefined {
  if (!type) return undefined
  return INJECT_TYPES.find((t) => t.id === type)?.label ?? type
}

/** "<title> — <type label>[, <detail>]"; falls back to the MSEL row id when untitled. */
export function injectAlt(
  inject: { title?: string; type?: string; mselRowId?: string } | undefined,
  detail?: string,
): string {
  const title =
    inject?.title?.trim() || (inject?.mselRowId ? `Inject ${inject.mselRowId}` : 'Inject')
  const type = injectTypeLabel(inject?.type)
  return `${title}${type ? ` — ${type}` : ''}${detail ? `, ${detail}` : ''}`
}

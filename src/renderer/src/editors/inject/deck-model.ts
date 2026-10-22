// Pure model of the deck overview: one entry per MSEL row in time order with its inject,
// thumbnail, media flags and warnings; plus the filters.
import { exerciseMinutes } from '@shared/schemas/common'
import type { Inject } from '@shared/schemas/inject'
import type { MediaAsset } from '@shared/schemas/media'
import type { LintWarning, MselRow, Scenario } from '@shared/schemas/scenario'
import { hasKind, thumbnailOf } from './media-utils'

export interface DeckEntry {
  row: MselRow
  inject: Inject | undefined
  thumbnail: MediaAsset | undefined
  audio: boolean
  video: boolean
  warnings: LintWarning[]
}

export interface DeckFilters {
  phase: string
  type: string
  tag: string
  media: '' | 'with' | 'without'
}

export const NO_FILTERS: DeckFilters = { phase: '', type: '', tag: '', media: '' }

const minutes = (t: string): number => {
  try {
    return exerciseMinutes(t)
  } catch {
    return Number.MAX_SAFE_INTEGER
  }
}

/** The scenario's warnings for this entry (main clears fixed-field warnings on save). */
function entryWarnings(s: Scenario, row: MselRow, inject: Inject | undefined) {
  return s.warnings.filter((w) =>
    inject ? w.injectId === inject.id : w.rowId === row.id && w.code.startsWith('INJECT_'),
  )
}

export function deckEntries(scenario: Scenario, injects: Inject[]): DeckEntry[] {
  const byId = new Map(injects.map((i) => [i.id, i]))
  const byRow = new Map(injects.map((i) => [i.mselRowId, i]))
  return scenario.msel
    .map((row, order) => ({ row, order }))
    .sort((a, b) => minutes(a.row.time) - minutes(b.row.time) || a.order - b.order)
    .map(({ row }) => {
      const inject = (row.injectId && byId.get(row.injectId)) || byRow.get(row.id)
      const assets = inject?.assets ?? []
      return {
        row,
        inject,
        thumbnail: thumbnailOf(assets),
        audio: hasKind(assets, 'audio'),
        video: hasKind(assets, 'video'),
        warnings: entryWarnings(scenario, row, inject),
      }
    })
}

export function filterDeck(entries: DeckEntry[], f: DeckFilters): DeckEntry[] {
  return entries.filter((e) => {
    if (f.phase && e.row.phaseId !== f.phase) return false
    if (f.type && (e.inject?.type ?? e.row.format ?? '') !== f.type) return false
    if (f.tag && e.row.purposeTag !== f.tag) return false
    const media = !!e.inject?.assets.length
    if (f.media === 'with' && !media) return false
    if (f.media === 'without' && media) return false
    return true
  })
}

/** Work state of an entry in the running job ("Working" for the current item). */
export function workState(
  e: DeckEntry,
  items: string[] | undefined,
): 'working' | 'done' | undefined {
  if (!items?.length) return undefined
  const ids = [e.row.id, e.inject?.id].filter(Boolean)
  if (ids.includes(items.at(-1))) return 'working'
  return items.some((i) => ids.includes(i)) ? 'done' : undefined
}

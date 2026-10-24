// Provenance of pack-provided items (ADR-0018, #269): the data behind ProvenanceBadge and the
// text for places that cannot hold a badge.
//   "Pack: <name> <version>"  the item is served from the installed pack;
//   "From <name> <version>"   the project's own copy of a pack item (<project>/packs.json);
// plus the states of a copy: "edited", "not installed", "Update available".
import type { PackCopyState } from '@shared/schemas/project-packs'

export interface Provenance {
  /** `pack`: served from the installed pack. `copy`: the project's copy of a pack item. */
  origin: 'pack' | 'copy'
  packId: string
  /** Display name; the id stands in when the pack never recorded one. */
  packName?: string
  /** The pack version the item (or the copy) comes from. */
  version?: string
  /** The copy's files differ from the sha256 recorded in <project>/packs.json. */
  edited?: boolean
  /** The pack is not installed (or is disabled). */
  packMissing?: boolean
  /** The installed pack has a newer version of the item. */
  updateAvailable?: boolean
  installedVersion?: string
}

export type ProvenanceState = 'edited' | 'not-installed' | 'update-available'

export const STATE_TEXT: Record<ProvenanceState, string> = {
  edited: 'edited',
  'not-installed': 'not installed',
  'update-available': 'Update available',
}

const packText = (p: Provenance): string =>
  [p.packName ?? p.packId, p.version].filter(Boolean).join(' ')

/** The visible source text: "Pack: Freight Rail Operations 1.0.0" or "From … 1.0.0". */
export const provenanceSourceText = (p: Provenance): string =>
  p.origin === 'pack' ? `Pack: ${packText(p)}` : `From ${packText(p)}`

/** States in display order. "Update available" is moot while the pack is not installed. */
export function provenanceStates(p: Provenance): ProvenanceState[] {
  const states: ProvenanceState[] = []
  if (p.edited) states.push('edited')
  if (p.packMissing) states.push('not-installed')
  else if (p.updateAvailable) states.push('update-available')
  return states
}

/** Plain text of the whole badge, for places that cannot hold one (native <option>s). */
export const provenanceText = (p: Provenance): string =>
  [provenanceSourceText(p), ...provenanceStates(p).map((s) => STATE_TEXT[s])].join(', ')

/** Accessible name: the pack name, its version and every state in words. */
export function provenanceLabel(p: Provenance): string {
  const source =
    p.origin === 'pack' ? `From pack ${packText(p)}` : `Project copy from pack ${packText(p)}`
  const states = provenanceStates(p).map((s) => {
    if (s === 'update-available')
      return p.installedVersion
        ? `update available (${p.installedVersion} installed)`
        : 'update available'
    return s === 'not-installed' ? 'pack not installed' : STATE_TEXT[s]
  })
  return [source, ...states].join(', ')
}

/** Item fields the IPC results carry (#261, #262, #264): source layer, pack and copy state. */
export interface PackSourced {
  source?: string
  packId?: string
  packVersion?: string
  packName?: string
  copy?: PackCopyState
}

/**
 * Provenance of a listed item, or undefined for built-in, user and plain project items.
 * `source === 'pack'` is served from the pack; any other source with a packId is a project
 * copy of a pack item.
 */
export function provenanceOf(item: PackSourced): Provenance | undefined {
  if (!item.packId) return undefined
  const origin = item.source === 'pack' ? 'pack' : 'copy'
  return {
    origin,
    packId: item.packId,
    ...(item.packName ? { packName: item.packName } : {}),
    ...(item.packVersion ? { version: item.packVersion } : {}),
    ...(origin === 'copy' && item.copy
      ? {
          edited: item.copy.edited,
          packMissing: item.copy.packMissing,
          updateAvailable: item.copy.updateAvailable,
          ...(item.copy.installedVersion ? { installedVersion: item.copy.installedVersion } : {}),
        }
      : {}),
  }
}

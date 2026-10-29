// This device's own hot wash items, kept in the tab's session storage so the "yours" marker and
// the withdraw window survive a reload (spec 0415 FR-9). Only what the device itself posted is
// kept: id, kind, text and when. The shared board comes back from the controller on catch-up.
import type { KeyValue } from '../../../shared/live/transport'
import type { BoardEntry, HotwashState } from './hotwash'

const MAX_KEPT = 50

export const ownItemsKey = (sessionId: string): string => `as-live:${sessionId}:hotwash-own`

/** The own items of a board, as stored. */
export function ownEntries(state: HotwashState): BoardEntry[] {
  return Object.values(state.items)
    .filter((e) => e.mine)
    .slice(-MAX_KEPT)
}

export function saveOwnItems(storage: KeyValue, sessionId: string, state: HotwashState): void {
  try {
    const own = ownEntries(state).map((e) => ({
      itemId: e.itemId,
      kind: e.kind,
      text: e.text,
      postedAt: e.postedAt ?? 0,
      ...(e.roleId ? { roleId: e.roleId } : {}),
    }))
    storage.set(ownItemsKey(sessionId), own.length ? JSON.stringify(own) : '')
  } catch {
    // storage blocked: the markers last for this page load only
  }
}

const KINDS = new Set(['strength', 'improvement', 'other'])

export function loadOwnItems(storage: KeyValue, sessionId: string): BoardEntry[] {
  try {
    const raw = storage.get(ownItemsKey(sessionId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, MAX_KEPT).flatMap((p): BoardEntry[] => {
      const o = p as Record<string, unknown>
      if (typeof o.itemId !== 'string' || typeof o.text !== 'string') return []
      if (typeof o.kind !== 'string' || !KINDS.has(o.kind)) return []
      return [
        {
          itemId: o.itemId.slice(0, 40),
          kind: o.kind as BoardEntry['kind'],
          text: o.text.slice(0, 2000),
          ...(typeof o.roleId === 'string' ? { roleId: o.roleId.slice(0, 128) } : {}),
          mine: true,
          shown: false,
          plus: 0,
          plusMine: false,
          promoted: false,
          postedAt: typeof o.postedAt === 'number' ? o.postedAt : 0,
        },
      ]
    })
  } catch {
    return []
  }
}

/** Own items back on the board; ones the controller already shows keep what it said. */
export function restoreOwn(state: HotwashState, own: readonly BoardEntry[]): HotwashState {
  const items = { ...state.items }
  for (const e of own) items[e.itemId] = items[e.itemId] ? { ...items[e.itemId]!, mine: true } : e
  return { ...state, items }
}

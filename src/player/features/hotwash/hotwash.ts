// What a device knows about the hot wash (spec 0415): whether it is open, and the board of
// accepted items the controller broadcasts, plus this device's own items. Pure functions so
// the session and the tests share one set of rules.
import type { HotwashUpdatePayload } from '../../../shared/live/schemas'

export type HotwashKind = 'strength' | 'improvement' | 'other'

export interface BoardEntry {
  itemId: string
  kind: HotwashKind
  text: string
  /** The seat the item shows; absent when it was posted without a role. */
  roleId?: string
  mine: boolean
  /** On the shared board. An own item that waits for the facilitator is not. */
  shown: boolean
  plus: number
  plusMine: boolean
  groupId?: string
  groupLabel?: string
  promoted: boolean
  /** Device clock when this device posted it; only own items have one. */
  postedAt?: number
}

export interface HotwashState {
  open: boolean
  items: Record<string, BoardEntry>
}

export const EMPTY_HOTWASH: HotwashState = { open: false, items: {} }

/** A device may withdraw its own item this long after posting it (spec 0415 FR-9). */
export const WITHDRAW_MS = 2 * 60_000
/** The length the composer suggests staying under. */
export const SUGGESTED_CHARS = 280
export const MAX_CHARS = 2000

export function setOpen(state: HotwashState, open: boolean): HotwashState {
  return state.open === open ? state : { ...state, open }
}

/** This device just posted: show it as its own, waiting until the controller shows it. */
export function addOwn(
  state: HotwashState,
  item: { itemId: string; kind: HotwashKind; text: string; anonymous: boolean; roleId?: string },
  now: number,
): HotwashState {
  const entry: BoardEntry = {
    itemId: item.itemId,
    kind: item.kind,
    text: item.text,
    ...(!item.anonymous && item.roleId ? { roleId: item.roleId } : {}),
    mine: true,
    shown: false,
    plus: 0,
    plusMine: false,
    promoted: false,
    postedAt: now,
  }
  return { ...state, items: { ...state.items, [item.itemId]: entry } }
}

const patch = (state: HotwashState, id: string, change: Partial<BoardEntry>): HotwashState => {
  const found = state.items[id]
  return found ? { ...state, items: { ...state.items, [id]: { ...found, ...change } } } : state
}

function without(state: HotwashState, id: string): HotwashState {
  const { [id]: _gone, ...items } = state.items
  return { ...state, items }
}

/** Apply one `hotwash.update` from the controller. Updates for an unknown item are ignored. */
export function applyUpdate(state: HotwashState, p: HotwashUpdatePayload): HotwashState {
  const id = p.itemId
  switch (p.action) {
    case 'accept': {
      const known = state.items[id]
      const entry: BoardEntry = {
        plus: 0,
        plusMine: false,
        promoted: false,
        ...known,
        itemId: id,
        kind: p.kind ?? known?.kind ?? 'other',
        text: p.text ?? known?.text ?? '',
        mine: known?.mine ?? false,
        shown: true,
        ...(p.roleId ? { roleId: p.roleId } : {}),
      }
      if (!p.roleId) delete entry.roleId
      return { ...state, items: { ...state.items, [id]: entry } }
    }
    case 'hide':
      return without(state, id)
    case 'edit':
      return p.text ? patch(state, id, { text: p.text }) : state
    case 'tag':
      return p.plus !== undefined ? patch(state, id, { plus: p.plus }) : state
    case 'group':
      return p.groupId
        ? patch(state, id, {
            groupId: p.groupId,
            ...(p.groupLabel ? { groupLabel: p.groupLabel } : {}),
          })
        : state
    case 'ungroup': {
      const found = state.items[id]
      if (!found) return state
      const { groupId: _g, groupLabel: _l, ...rest } = found
      return { ...state, items: { ...state.items, [id]: rest } }
    }
    case 'promote':
      return patch(state, id, { promoted: true })
    case 'unpromote':
      return patch(state, id, { promoted: false })
    default:
      return state
  }
}

/** A +1 from this device: counted at once, then corrected by the controller's count. */
export function addPlusMine(state: HotwashState, id: string): HotwashState {
  const found = state.items[id]
  if (!found || found.mine || found.plusMine) return state
  return patch(state, id, { plusMine: true, plus: found.plus + 1 })
}

export function removeOwn(state: HotwashState, id: string): HotwashState {
  return state.items[id]?.mine ? without(state, id) : state
}

export function canWithdraw(entry: BoardEntry, now: number): boolean {
  return entry.mine && !entry.promoted && now - (entry.postedAt ?? 0) <= WITHDRAW_MS
}

export type BoardRow =
  | { type: 'item'; entry: BoardEntry; plus: number; promoted: boolean }
  | {
      type: 'group'
      groupId: string
      label?: string
      entries: BoardEntry[]
      plus: number
      promoted: boolean
    }

/** What the shared board shows: groups as one row, most +1s first. */
export function boardRows(state: HotwashState): BoardRow[] {
  const shown = Object.values(state.items).filter((e) => e.shown)
  const groups = new Map<string, BoardEntry[]>()
  const rows: BoardRow[] = []
  for (const entry of shown) {
    if (!entry.groupId) {
      rows.push({ type: 'item', entry, plus: entry.plus, promoted: entry.promoted })
      continue
    }
    groups.set(entry.groupId, [...(groups.get(entry.groupId) ?? []), entry])
  }
  for (const [groupId, entries] of groups) {
    const label = entries.find((e) => e.groupLabel)?.groupLabel
    rows.push({
      type: 'group',
      groupId,
      ...(label ? { label } : {}),
      entries,
      plus: entries.reduce((n, e) => n + e.plus, 0),
      promoted: entries.some((e) => e.promoted),
    })
  }
  return rows.sort((a, b) => b.plus - a.plus)
}

/** This device's items the controller has not shown yet. */
export const waitingOwn = (state: HotwashState): BoardEntry[] =>
  Object.values(state.items).filter((e) => e.mine && !e.shown)

export const shownCount = (state: HotwashState): number =>
  Object.values(state.items).filter((e) => e.shown).length

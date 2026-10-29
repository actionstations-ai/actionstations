// Pure helpers for the hot wash board (#415): which items sit in which column, how a group is
// laid out, and what a selection of items allows. No React here, so the rules are tested alone.
import type { BoardView, HotWashGroup, HotWashItem } from '@shared/schemas/live'

export type Column = 'strength' | 'improvement' | 'other'
export const COLUMNS: { kind: Column; title: string }[] = [
  { kind: 'strength', title: 'Strengths' },
  { kind: 'improvement', title: 'Improvements' },
  { kind: 'other', title: 'Other and answers' },
]

export type Cell =
  | { type: 'item'; item: HotWashItem; plus: number }
  | { type: 'group'; group: HotWashGroup; items: HotWashItem[]; plus: number }

const shown = (i: HotWashItem) => i.accepted && !i.hidden

/** Items waiting for the facilitator's Accept (review mode). */
export const inbox = (b: BoardView): HotWashItem[] =>
  b.items.filter((i) => !i.accepted && !i.hidden)
export const hidden = (b: BoardView): HotWashItem[] => b.items.filter((i) => i.hidden)
export const shownItems = (b: BoardView): HotWashItem[] => b.items.filter(shown)

/** A group sits in the column of its first shown member; cells sort by +1, then by time. */
export function cellsFor(b: BoardView, column: Column): Cell[] {
  const cells: Cell[] = []
  const groups = new Map(b.groups.map((g) => [g.groupId, g]))
  const done = new Set<string>()
  for (const item of shownItems(b)) {
    const group = item.groupId ? groups.get(item.groupId) : undefined
    if (!group) {
      if (item.kind === column) cells.push({ type: 'item', item, plus: item.plus })
      continue
    }
    if (done.has(group.groupId)) continue
    done.add(group.groupId)
    const members = shownItems(b).filter((i) => i.groupId === group.groupId)
    if (members[0]?.kind !== column) continue
    cells.push({
      type: 'group',
      group,
      items: members,
      plus: members.reduce((n, m) => n + m.plus, 0),
    })
  }
  return cells.sort((a, c) => c.plus - a.plus)
}

/** The key a promote call takes for an item: its group when it has one. */
export const promoteKey = (item: HotWashItem): string => item.groupId ?? item.itemId

export interface SelectionFacts {
  count: number
  canGroup: boolean
  canUngroup: boolean
  canLabel: boolean
  canEdit: boolean
  anyPromoted: boolean
  allPromoted: boolean
}

export function selectionFacts(b: BoardView, selected: ReadonlySet<string>): SelectionFacts {
  const items = b.items.filter((i) => selected.has(i.itemId))
  const grouped = items.filter((i) => i.groupId)
  const promoted = items.filter((i) => i.promoted)
  return {
    count: items.length,
    canGroup: items.length >= 2 && items.every(shown),
    canUngroup: grouped.length > 0,
    canLabel: grouped.length > 0,
    canEdit: items.length === 1,
    anyPromoted: promoted.length > 0,
    allPromoted: items.length > 0 && promoted.length === items.length,
  }
}

/** Who the board says posted an item: the role, or "anonymous". */
export function senderLabel(i: HotWashItem): string {
  if (i.anonymous || !i.roleLabel) return 'anonymous'
  return i.displayName ? `${i.roleLabel} (${i.displayName})` : i.roleLabel
}

export function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** The lines the projector shows: promoted groups and items, no roles, no names, no counts. */
export function promotedLines(b: BoardView): { kind: Column; text: string }[] {
  const lines: { kind: Column; text: string }[] = []
  const seen = new Set<string>()
  for (const item of shownItems(b)) {
    if (!item.promoted) continue
    if (!item.groupId) {
      lines.push({ kind: item.kind, text: item.text })
      continue
    }
    if (seen.has(item.groupId)) continue
    seen.add(item.groupId)
    const group = b.groups.find((g) => g.groupId === item.groupId)
    lines.push({ kind: item.kind, text: group?.label || item.text })
  }
  return lines
}

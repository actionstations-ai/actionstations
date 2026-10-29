/**
 * A past session's hot wash board, rebuilt from its log (spec 0415 FR-11). The log is the record,
 * so the board of a finished or interrupted session is a fold over `hotwash.*` entries and the
 * same `BoardView` the live board returns. The names a seat shows come from the roles, because
 * the log keeps role ids, never labels.
 */
import type { BoardView, HotWashGroup, HotWashItem, SessionLogEntry } from '@shared/schemas/live'

type Mutable = HotWashItem & { plusBy: Set<string> }

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
const ms = (iso: string): number => Date.parse(iso)

interface State {
  open: boolean
  review: boolean
  items: Map<string, Mutable>
  groups: Map<string, HotWashGroup>
}

function addItem(
  s: State,
  e: SessionLogEntry,
  roleName: (id: string | undefined) => string | undefined,
) {
  const itemId = e.ref?.itemId
  if (!itemId || s.items.has(itemId) || e.data.retractOf || e.data.plusOneOf) return
  const anonymous = e.data.anonymous === true
  const kind = e.data.kind
  const roleLabel = anonymous ? undefined : roleName(e.actor.seat?.roleId)
  const optional = (key: 'questionId' | 'mselRowId' | 'objectiveId') => {
    const v = str(e.data[key])
    return v ? { [key]: v } : {}
  }
  s.items.set(itemId, {
    itemId,
    kind: kind === 'strength' || kind === 'improvement' ? kind : 'other',
    text: str(e.data.text) ?? '',
    anonymous,
    ...(roleLabel ? { roleLabel } : {}),
    ...(!anonymous && e.actor.displayName ? { displayName: e.actor.displayName } : {}),
    ...optional('questionId'),
    ...optional('mselRowId'),
    ...optional('objectiveId'),
    at: ms(e.at),
    exerciseTime: e.ex ?? '',
    accepted: !s.review,
    hidden: false,
    plus: 0,
    promoted: false,
    plusBy: new Set(),
  })
}

function editItem(item: Mutable, data: Record<string, unknown>) {
  const after = str(data.after) ?? str(data.text)
  if (!after) return
  item.originalText ??= str(data.before) ?? item.text
  item.text = after
}

function tagItem(item: Mutable, data: Record<string, unknown>) {
  for (const key of ['objectiveId', 'capability', 'mselRowId'] as const) {
    const v = data[key]
    if (v === null) delete item[key]
    else if (typeof v === 'string') item[key] = v
  }
}

function groupItems(s: State, e: SessionLogEntry) {
  const groupId = str(e.data.groupId) ?? e.ref?.groupId
  if (!groupId) return
  const members = strings(e.data.itemIds).filter((id) => s.items.has(id))
  for (const [id, g] of s.groups) {
    if (id === groupId) continue
    g.itemIds = g.itemIds.filter((m) => !members.includes(m))
    if (g.itemIds.length < 2) s.groups.delete(id)
  }
  const label = str(e.data.label) ?? s.groups.get(groupId)?.label
  s.groups.set(groupId, { groupId, itemIds: members, promoted: false, ...(label ? { label } : {}) })
  for (const id of members) s.items.get(id)!.groupId = groupId
}

function groupEvent(s: State, e: SessionLogEntry) {
  const action = str(e.data.action)
  const groupId = str(e.data.groupId) ?? e.ref?.groupId
  if (action === 'group') return groupItems(s, e)
  const group = groupId ? s.groups.get(groupId) : undefined
  if (action === 'label' && group) {
    const label = str(e.data.label)
    if (label) group.label = label
    else delete group.label
  } else if (action === 'ungroup' && groupId) {
    const leaving = new Set(strings(e.data.itemIds))
    for (const id of leaving) delete s.items.get(id)?.groupId
    if (!group) return
    group.itemIds = group.itemIds.filter((m) => !leaving.has(m))
    if (group.itemIds.length < 2) {
      for (const id of group.itemIds) delete s.items.get(id)?.groupId
      s.groups.delete(groupId)
    }
  }
}

function updateEvent(s: State, e: SessionLogEntry) {
  const action = str(e.data.action)
  if (action === 'review') s.review = e.data.review === true
  if (action === 'group' || action === 'label' || action === 'ungroup') return groupEvent(s, e)
  for (const id of strings(e.data.itemIds)) {
    const item = s.items.get(id)
    if (!item) continue
    if (action === 'accept') item.accepted = true
    else if (action === 'hide') item.hidden = true
    else if (action === 'restore') item.hidden = false
    else if (action === 'edit') editItem(item, e.data)
    else if (action === 'tag') tagItem(item, e.data)
  }
}

function promotion(s: State, e: SessionLogEntry, on: boolean) {
  const ids = strings(e.data.memberItemIds)
  for (const id of ids.length ? ids : e.ref?.itemId ? [e.ref.itemId] : []) {
    const item = s.items.get(id)
    if (item) item.promoted = on
  }
  const groupId = e.ref?.groupId
  const group = groupId ? s.groups.get(groupId) : undefined
  if (group) group.promoted = on
}

function apply(
  s: State,
  e: SessionLogEntry,
  roleName: (id: string | undefined) => string | undefined,
) {
  switch (e.kind) {
    case 'hotwash.open':
      s.open = true
      s.review = e.data.review === true
      break
    case 'hotwash.close':
      s.open = false
      break
    case 'hotwash.item':
      addItem(s, e, roleName)
      break
    case 'hotwash.plus':
      s.items.get(e.ref?.itemId ?? '')?.plusBy.add(e.actor.clientRef ?? String(e.i))
      break
    case 'hotwash.retract': {
      const item = s.items.get(e.ref?.itemId ?? '')
      if (item) item.hidden = true
      break
    }
    case 'hotwash.update':
      updateEvent(s, e)
      break
    case 'hotwash.promoted':
      promotion(s, e, true)
      break
    case 'hotwash.unpromoted':
      promotion(s, e, false)
      break
    default:
  }
}

/** The board as the log left it. A past session is not open: nothing more will arrive. */
export function boardFromLog(
  entries: readonly SessionLogEntry[],
  questions: BoardView['questions'],
  roleName: (id: string | undefined) => string | undefined,
): BoardView {
  const s: State = { open: false, review: false, items: new Map(), groups: new Map() }
  for (const e of entries) apply(s, e, roleName)
  const items = [...s.items.values()]
    .sort((a, b) => a.at - b.at)
    .map(({ plusBy, ...item }) => ({ ...item, plus: plusBy.size }))
  return {
    open: false,
    review: s.review,
    items,
    groups: [...s.groups.values()].map((g) => ({ ...g, itemIds: [...g.itemIds] })),
    questions: questions.map((q) => ({ ...q })),
  }
}
